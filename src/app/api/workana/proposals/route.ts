import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/db";
import {
  getProposalsDetailed,
  updateProposal,
  getProjectRowForProposal,
  getProposalForSubmit,
  markProposalSubmitted,
  markProposalFailed,
  claimProposalForSending,
  releaseProposalClaim,
  getWeeklyConnectionUsage,
  getLastSubmittedAt,
  getStyleExamples,
} from "@/db/workana";
import { draftProposal, PROPOSAL_TONE_DIRECTIVES } from "@/lib/workana/ai";
import { submitProposal, formatDeliveryTime, type SubmitResult } from "@/lib/workana/submit";
import { withSendLock } from "@/lib/cron/send-lock";
import { WORKANA_DEFAULTS } from "@/lib/workana/priority";
import type { ScrapedProject } from "@/lib/workana/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function enabled(): boolean {
  return getSetting("workana_enabled") === "true";
}

const VALID_STATUS = ["draft", "approved", "rejected"] as const;
type EditableStatus = (typeof VALID_STATUS)[number];

/**
 * Compose the rewrite directive from a tone preset + free-form user instructions.
 * Both are operator-provided (trusted), so no fencing is needed; we just bound length.
 */
function composeDirective(tone: unknown, instructions: unknown): string | undefined {
  const parts: string[] = [];
  const toneDir = typeof tone === "string" ? PROPOSAL_TONE_DIRECTIVES[tone] : undefined;
  if (toneDir) parts.push(toneDir);
  const custom = typeof instructions === "string" ? instructions.trim().slice(0, 500) : "";
  if (custom) parts.push(`Instrucciones específicas del usuario: ${custom}`);
  return parts.length ? parts.join("\n") : undefined;
}

// Single-flight guard for REAL submits: serializes them so the budget check and the
// spend can't race across concurrent requests (two tabs / retry / two proposals).
let realSubmitInFlight = false;

export async function GET() {
  if (!enabled()) return NextResponse.json({ error: "workana_disabled" }, { status: 403 });
  return NextResponse.json({ proposals: getProposalsDetailed(60) });
}

/**
 * PUT: edit a draft and/or change its status, or regenerate it.
 * Body: { id, action?: "regenerate", coverLetter?, bidAmount?, deliveryDays?, currency?,
 *         screeningAnswers?, status? ("draft"|"approved"|"rejected") }
 * NOTE: there is intentionally NO submit/send action here (Fase 3 sin envío real).
 */
export async function PUT(req: NextRequest) {
  if (!enabled()) return NextResponse.json({ error: "workana_disabled" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!id || !Number.isFinite(id)) return NextResponse.json({ error: "id required" }, { status: 400 });

  try {
    if (body?.action === "regenerate") {
      const row = getProjectRowForProposal(id);
      if (!row) return NextResponse.json({ error: "project not found" }, { status: 404 });
      const p = row.project;
      const project: ScrapedProject = {
        workanaProjectId: p.workanaProjectId,
        url: p.url ?? "",
        title: p.title,
        description: p.description ?? "",
        skills: p.skills ? (JSON.parse(p.skills) as string[]) : [],
        budgetText: null,
        bidsCount: p.bidsCount ?? null,
        publishedText: null,
        rawText: p.rawText ?? p.description ?? "",
      };
      const directive = composeDirective(body?.tone, body?.instructions);
      const examples = getStyleExamples({ skills: project.skills, excludeProjectId: p.id });
      const draft = await draftProposal(
        project,
        { shouldBid: true, fitScore: p.fitScore ?? 50, reason: p.reason ?? "", language: p.language ?? "es" },
        row.agencyProfileId,
        { directive, examples }
      );
      updateProposal(id, {
        coverLetter: draft.coverLetter,
        bidAmount: draft.bidAmount,
        deliveryDays: draft.deliveryDays,
        screeningAnswers: draft.screeningAnswers,
        confidence: draft.confidence,
        status: "draft",
      });
      // Return the new fields so the UI can apply them immediately (avoids a stale
      // textarea/bid/days if the regenerated cover letter happens to be the same length).
      return NextResponse.json({
        ok: true,
        regenerated: true,
        draft: {
          coverLetter: draft.coverLetter,
          bidAmount: draft.bidAmount,
          deliveryDays: draft.deliveryDays,
          confidence: draft.confidence,
        },
      });
    }

    // Real submission (or dry-run fill). Submitting requires an approved proposal;
    // submitProposal itself is hard-gated behind workana_allow_submit.
    // Dry-run: fill the form only, no lock, no budget (safe, never submits).
    if (body?.action === "submit_dry") {
      const p = getProposalForSubmit(id);
      if (!p) return NextResponse.json({ error: "proposal not found" }, { status: 404 });
      if (!p.slug) return NextResponse.json({ error: "project slug missing" }, { status: 400 });
      const res = await submitProposal({
        slug: p.slug,
        coverLetter: p.coverLetter,
        bidAmount: p.bidAmount,
        deliveryTime: formatDeliveryTime(p.deliveryDays, p.language),
        dryRun: true,
      });
      return NextResponse.json(res);
    }

    // Real submit: serialized so the budget check and the spend can't race.
    if (body?.action === "submit") {
      if (realSubmitInFlight) {
        return NextResponse.json({ error: "another submission is in progress, try again in a moment" }, { status: 409 });
      }
      realSubmitInFlight = true;
      try {
        const p = getProposalForSubmit(id);
        if (!p) return NextResponse.json({ error: "proposal not found" }, { status: 404 });
        if (!p.slug) return NextResponse.json({ error: "project slug missing" }, { status: 400 });
        if (p.status !== "approved") {
          return NextResponse.json({ error: "proposal must be approved before sending" }, { status: 400 });
        }
        // Workana requires the bid amount (field "Valor total").
        if (p.bidAmount == null) {
          return NextResponse.json({ error: "bid amount required (edit the proposal first)" }, { status: 400 });
        }
        // Send spacing: keep at least the configured gap between any two real sends
        // (manual or auto), so two offers never go out together.
        const intervalMin =
          Number(getSetting("workana_min_send_interval_minutes")) || WORKANA_DEFAULTS.minSendIntervalMinutes;
        const last = getLastSubmittedAt();
        if (last) {
          const elapsedMin = (Date.now() - Date.parse(last)) / 60_000;
          if (elapsedMin < intervalMin) {
            const nextInMin = Math.max(1, Math.ceil(intervalMin - elapsedMin));
            return NextResponse.json(
              { error: `Espera ${nextInMin} min entre envíos (intervalo mínimo ${intervalMin} min).`, nextInMin },
              { status: 429 }
            );
          }
        }
        // Weekly connection budget — re-read inside the lock so it's never overshot.
        const { used, budget } = getWeeklyConnectionUsage();
        if (budget > 0 && used >= budget) {
          return NextResponse.json({ error: "weekly connection budget reached", used, budget }, { status: 429 });
        }
        // Share the "workana" send lock with the auto-sender so the two never drive
        // the browser (or spend the weekly budget) at the same time. The crash-safe
        // claim (approved → "sending") happens INSIDE the lock so a busy lock never
        // strands a proposal mid-claim.
        const res = await withSendLock<SubmitResult>(
          "workana",
          { ok: false, error: "otro envío en curso, reintenta en un momento" },
          async () => {
            // Claim it; if it's no longer approved (auto-sender took it / already
            // sending or sent), bail without sending — never double-send.
            if (!claimProposalForSending(id)) {
              return { ok: false, error: "la propuesta ya no está aprobada (¿enviándose o ya enviada?)" };
            }
            const r = await submitProposal({
              slug: p.slug!,
              coverLetter: p.coverLetter,
              bidAmount: p.bidAmount!,
              deliveryTime: formatDeliveryTime(p.deliveryDays, p.language),
            });
            if (r.ok) {
              markProposalSubmitted(id, r.ref ?? null);
            } else if (/not_logged_in|session lost|reconnect|sesión/i.test(r.error ?? "")) {
              releaseProposalClaim(id); // not posted → back to approved for retry
            } else {
              markProposalFailed(id, r.error ?? null); // not-sent failure → out of the queue
            }
            return r;
            // NOTE: if submitProposal THROWS (ambiguous — bid may have posted), the
            // proposal is intentionally left "sending" for manual verification.
          }
        );
        return NextResponse.json(res);
      } finally {
        realSubmitInFlight = false;
      }
    }

    const status: EditableStatus | undefined = VALID_STATUS.includes(body?.status) ? body.status : undefined;
    updateProposal(id, {
      coverLetter: typeof body?.coverLetter === "string" ? body.coverLetter : undefined,
      bidAmount: body?.bidAmount === null || Number.isFinite(body?.bidAmount) ? body.bidAmount : undefined,
      deliveryDays: body?.deliveryDays === null || Number.isFinite(body?.deliveryDays) ? body.deliveryDays : undefined,
      currency: typeof body?.currency === "string" ? body.currency : undefined,
      screeningAnswers: Array.isArray(body?.screeningAnswers) ? body.screeningAnswers : undefined,
      status,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
