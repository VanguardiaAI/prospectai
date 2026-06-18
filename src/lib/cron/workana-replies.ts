import { getSetting, setSetting } from "@/db";
import { logger } from "@/lib/logger";
import { scrapeInbox } from "@/lib/workana/scraper";
import { probeLoggedIn } from "@/lib/workana/browser";
import { classifyReply } from "@/lib/reply-classification";
import { draftReplyResponse } from "@/lib/workana/ai";
import { getKnownReplyExternalIds, insertReply, matchProjectBySlug, matchProjectByTitle } from "@/db/workana";

export interface RepliesResult {
  skipped?: string;
  scanned?: number;
  added?: number;
}

/**
 * Scrape the Workana inbox, classify each new client message's intent, and (for
 * promising ones) draft a suggested reply. Stored in `workana_replies` as an
 * actionable inbox. Nothing is auto-sent — suggestions are for the user.
 */
export async function processWorkanaReplies(): Promise<RepliesResult> {
  if (getSetting("workana_enabled") !== "true") return { skipped: "disabled" };

  // Confirm the session is still valid; flip to needs_reauth so the UI can nudge.
  const loggedIn = await probeLoggedIn();
  if (!loggedIn) {
    if (getSetting("workana_auth_state") === "connected") setSetting("workana_auth_state", "needs_reauth");
    return { skipped: "needs_reauth" };
  }
  if (getSetting("workana_auth_state") !== "connected") setSetting("workana_auth_state", "connected");

  let scanned = 0;
  let added = 0;
  try {
    const messages = await scrapeInbox();
    scanned = messages.length;
    const known = getKnownReplyExternalIds();
    for (const m of messages) {
      if (known.has(m.externalId)) continue;
      known.add(m.externalId);
      const intent = await classifyReply(m.body, "workana");
      const projectId = matchProjectBySlug(m.projectSlug) ?? matchProjectByTitle(m.projectTitle);
      // Only spend an Opus call on a suggested reply when it's worth answering.
      const suggested =
        intent === "interested" || intent === "question" ? await draftReplyResponse(m.body, m.projectTitle, null) : null;
      insertReply(m, intent, suggested, projectId);
      added++;
    }
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "workana-replies: failed");
  }

  logger.info({ scanned, added }, "workana-replies: complete");
  return { scanned, added };
}
