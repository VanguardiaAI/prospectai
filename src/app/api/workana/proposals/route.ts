import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/db";
import {
  getProposalsDetailed,
  updateProposal,
  getProjectRowForProposal,
  getProposalForSubmit,
  markProposalSubmitted,
  getWeeklyConnectionUsage,
} from "@/db/workana";
import { draftProposal } from "@/lib/workana/ai";
import { submitProposal } from "@/lib/workana/submit";
import type { ScrapedProject } from "@/lib/workana/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function enabled(): boolean {
  return getSetting("workana_enabled") === "true";
}

const VALID_STATUS = ["draft", "approved", "rejected"] as const;
type EditableStatus = (typeof VALID_STATUS)[number];

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
      const draft = await draftProposal(
        project,
        { shouldBid: true, fitScore: p.fitScore ?? 50, reason: p.reason ?? "", language: p.language ?? "es" },
        row.agencyProfileId
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
      const res = await submitProposal({ slug: p.slug, coverLetter: p.coverLetter, bidAmount: p.bidAmount, dryRun: true });
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
        // Weekly connection budget — re-read inside the lock so it's never overshot.
        const { used, budget } = getWeeklyConnectionUsage();
        if (budget > 0 && used >= budget) {
          return NextResponse.json({ error: "weekly connection budget reached", used, budget }, { status: 429 });
        }
        const res = await submitProposal({ slug: p.slug, coverLetter: p.coverLetter, bidAmount: p.bidAmount });
        if (res.ok) markProposalSubmitted(id, res.ref ?? null);
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
