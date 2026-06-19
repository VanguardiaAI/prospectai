import { getSetting } from "@/db";
import { logger } from "@/lib/logger";
import { withSendLock } from "@/lib/cron/send-lock";
import { submitProposal, formatDeliveryTime, type SubmitResult } from "@/lib/workana/submit";
import {
  getWeeklyConnectionUsage,
  getTodaySubmittedCount,
  getLastSubmittedAt,
  listApprovedForSending,
  claimProposalForSending,
  releaseProposalClaim,
  markProposalSubmitted,
  markProposalFailed,
} from "@/db/workana";
import { WORKANA_DEFAULTS, priorityScore } from "@/lib/workana/priority";

export interface WorkanaSendResult {
  skipped?: string;
  sent?: number;
  id?: number;
  used?: number;
  budget?: number;
  /** Minutes until the next send is allowed (when skipped for spacing). */
  nextInMin?: number;
}

/**
 * Auto-spaced Workana sender (Professional plan). Sends AT MOST ONE approved
 * proposal per call, highest-priority first (recency + fit + confidence), and only
 * when ALL gates pass: enabled, real-send allowed, auto-send on, weekly budget left,
 * optional daily cap not hit, and at least the configured interval since the last
 * send. Because the cron ticks every few minutes and we enforce the interval, this
 * naturally drips one send every ~20 min until the weekly budget (default 17) is used
 * — draining the approved pool (best opportunities first, then the reserve).
 *
 * Hard-gated the same way as manual sends (workana_allow_submit) and serialized with
 * them via the shared "workana" send lock, so the two never drive the browser at once.
 */
export async function processWorkanaSending(): Promise<WorkanaSendResult> {
  if (getSetting("workana_enabled") !== "true") return { skipped: "disabled" };
  if (getSetting("workana_allow_submit") !== "true") return { skipped: "submit_disabled" };
  if (getSetting("workana_autosend_enabled") !== "true") return { skipped: "autosend_off" };

  return withSendLock<WorkanaSendResult>("workana", { skipped: "locked" }, async () => {
    // Weekly connection budget — re-read inside the lock so it's never overshot.
    const { used, budget } = getWeeklyConnectionUsage();
    if (budget > 0 && used >= budget) return { skipped: "weekly_budget", used, budget };

    // Optional soft daily cap (0 = off; weekly budget + spacing govern the pace).
    const dailyCap = Number(getSetting("workana_max_sends_per_day")) || WORKANA_DEFAULTS.maxSendsPerDay;
    if (dailyCap > 0 && getTodaySubmittedCount() >= dailyCap) return { skipped: "daily_cap" };

    // Spacing: at least N minutes since the last real send (no two offers together).
    const intervalMin =
      Number(getSetting("workana_min_send_interval_minutes")) || WORKANA_DEFAULTS.minSendIntervalMinutes;
    const last = getLastSubmittedAt();
    if (last) {
      const elapsedMin = (Date.now() - Date.parse(last)) / 60_000;
      if (elapsedMin < intervalMin) {
        return { skipped: "spacing", nextInMin: Math.max(1, Math.ceil(intervalMin - elapsedMin)) };
      }
    }

    // Pick the highest-priority approved proposal that's actually sendable.
    const candidates = listApprovedForSending().filter((c) => c.slug && c.bidAmount != null);
    if (!candidates.length) return { skipped: "no_approved" };
    const nowMs = Date.now();
    candidates.sort((a, b) => priorityScore(b, nowMs) - priorityScore(a, nowMs));
    const next = candidates[0];

    // CRASH-SAFE CLAIM: flip approved → "sending" BEFORE the (slow ~90s) real send.
    // If the app restarts mid-send, the proposal stays "sending" — never re-picked —
    // so a real client is never bid twice. (Belt-and-suspenders with the send lock.)
    if (!claimProposalForSending(next.id)) return { skipped: "claim_lost", id: next.id };

    const deliveryTime = formatDeliveryTime(next.deliveryDays, next.language);
    let res: SubmitResult;
    try {
      res = await submitProposal({
        slug: next.slug!,
        coverLetter: next.coverLetter,
        bidAmount: next.bidAmount!,
        deliveryTime,
      });
    } catch (e) {
      // Ambiguous: the bid MAY already be posted. Do NOT auto-retry (a double bid is
      // irreparable) — leave it claimed as "sending" for the user to verify on Workana.
      logger.error(
        { err: (e as Error).message, id: next.id },
        "workana-send: submit threw — left as 'sending' for manual review"
      );
      return { skipped: "error_stuck", id: next.id };
    }

    if (res.ok) {
      markProposalSubmitted(next.id, res.ref ?? null);
      logger.info({ id: next.id, slug: next.slug, used: used + 1, budget }, "workana-send: sent (auto)");
      return { sent: 1, id: next.id, used: used + 1, budget };
    }

    // Auth/session failure happens BEFORE any bid is posted → safe to retry: release
    // the claim back to "approved" (otherwise we'd strand the whole queue while logged out).
    const err = res.error ?? "";
    if (/not_logged_in|session lost|reconnect|sesión/i.test(err)) {
      releaseProposalClaim(next.id);
      logger.warn({ id: next.id, error: err }, "workana-send: auth issue, released for retry");
      return { skipped: "not_logged_in", id: next.id };
    }

    // A genuine, not-sent failure (project closed, already applied, validation, no
    // success signal): mark it failed so the queue advances; the user re-approves if needed.
    markProposalFailed(next.id, err || "send failed");
    logger.warn({ id: next.id, slug: next.slug, error: err }, "workana-send: failed, marked failed");
    return { skipped: "send_failed", id: next.id };
  });
}
