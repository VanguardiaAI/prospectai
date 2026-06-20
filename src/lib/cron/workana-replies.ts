import { getSetting, setSetting } from "@/db";
import { logger } from "@/lib/logger";
import { scrapeInbox } from "@/lib/workana/scraper";
import { probeLoggedIn } from "@/lib/workana/browser";
import { classifyReply } from "@/lib/reply-classification";
import { draftReplyResponse } from "@/lib/workana/ai";
import {
  getKnownReplyExternalIds,
  insertReply,
  matchProjectBySlug,
  matchProjectByTitle,
  getOwnProposalCovers,
} from "@/db/workana";

export interface RepliesResult {
  skipped?: string;
  scanned?: number;
  added?: number;
  /** Inbox entries dropped because they were our own outgoing message or a Workana notice. */
  filtered?: number;
}

/** Strip the Workana inbox preview prefix ("Nueva propuesta · Hace 3 horas") and
 *  normalize whitespace/case for loose comparison. */
function normalizePreview(s: string): string {
  return (s || "")
    .replace(/^\s*(nueva propuesta|nuevo mensaje|new (proposal|message))/i, " ")
    .replace(/\bhace\s+(un|una|\d+)\s+\w+/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * True when an inbox entry is really OUR outgoing proposal, NOT a client reply:
 * either the thread preview is flagged "Nueva propuesta" (we just bid, no client
 * reply yet), or its text matches the start of one of our sent/queued proposals.
 * This is what stops our own messages from polluting the replies inbox.
 */
function isOwnOutgoing(body: string, ownCovers: string[]): boolean {
  if (/^\s*nueva propuesta\b/i.test(body || "")) return true;
  const b = normalizePreview(body);
  if (b.length < 12) return false;
  const head = b.slice(0, 50);
  for (const c of ownCovers) {
    const cn = (c || "").replace(/\s+/g, " ").trim().toLowerCase();
    if (cn.length >= 12 && (cn.startsWith(head) || b.startsWith(cn.slice(0, 50)))) return true;
  }
  return false;
}

/** Workana promo/recruiter notices ("¿Estás disponible? ¡Te están buscando!") that
 *  are not real client messages. Kept narrow so genuine replies are never dropped. */
function isWorkanaNotice(body: string): boolean {
  return /te est[áa]n buscando/i.test(body || "");
}

/**
 * Scrape the Workana inbox, classify each new client message's intent, and (for
 * promising ones) draft a suggested reply. Stored in `workana_replies` as an
 * actionable inbox. Nothing is auto-sent — suggestions are for the user.
 */
export async function processWorkanaReplies(opts: { force?: boolean } = {}): Promise<RepliesResult> {
  if (getSetting("workana_enabled") !== "true") return { skipped: "disabled" };

  // Time-gate (the manual "check now" passes force): avoid hitting the inbox every
  // cron tick — frequent visits look bot-like (ToS/pacing). Default every 2 hours.
  const intervalH = Number(getSetting("workana_replies_interval_hours")) || 2;
  const last = getSetting("workana_last_replies_at");
  if (!opts.force && last) {
    const elapsedH = (Date.now() - new Date(last).getTime()) / 3_600_000;
    if (elapsedH < intervalH) return { skipped: "interval" };
  }

  // Confirm the session is still valid; flip to needs_reauth so the UI can nudge.
  const loggedIn = await probeLoggedIn();
  if (!loggedIn) {
    if (getSetting("workana_auth_state") === "connected") setSetting("workana_auth_state", "needs_reauth");
    return { skipped: "needs_reauth" };
  }
  if (getSetting("workana_auth_state") !== "connected") setSetting("workana_auth_state", "connected");

  let scanned = 0;
  let added = 0;
  let filtered = 0;
  try {
    const messages = await scrapeInbox();
    scanned = messages.length;
    const known = getKnownReplyExternalIds();
    const ownCovers = getOwnProposalCovers();
    for (const m of messages) {
      if (known.has(m.externalId)) continue;
      known.add(m.externalId);
      // Differentiate OUR outgoing messages (proposals we sent) and Workana notices
      // from real client replies — otherwise the inbox fills with our own proposals
      // and becomes unmanageable. Skip before spending an AI classification call.
      if (isOwnOutgoing(m.body, ownCovers) || isWorkanaNotice(m.body)) {
        filtered++;
        continue;
      }
      const intent = await classifyReply(m.body, "workana");
      const projectId = matchProjectBySlug(m.projectSlug) ?? matchProjectByTitle(m.projectTitle);
      // Only spend an Opus call on a suggested reply when it's worth answering.
      const suggested =
        intent === "interested" || intent === "question" ? await draftReplyResponse(m.body, m.projectTitle, null) : null;
      insertReply(m, intent, suggested, projectId);
      added++;
    }
    // Only advance the gate after a genuinely completed scrape, so a transient
    // failure is retried on the next tick instead of being suppressed for the interval.
    setSetting("workana_last_replies_at", new Date().toISOString());
    logger.info({ scanned, added, filtered }, "workana-replies: complete");
    return { scanned, added, filtered };
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "workana-replies: failed");
    return { skipped: "error", scanned, added };
  }
}
