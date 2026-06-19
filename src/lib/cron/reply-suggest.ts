import { db, getSetting } from "@/db";
import { replies, campaigns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { draftConversationReply } from "@/lib/ai/reply-assistant";
import type { ReplyIntent } from "@/lib/reply-intent";

interface SuggestInput {
  replyId: number;
  leadId: number;
  channel: "email" | "whatsapp";
  intent: ReplyIntent | null;
  body: string | null;
  leadName?: string | null;
  leadCategory?: string | null;
  campaignId?: number | null;
}

/**
 * Best-effort pre-generation of a suggested reply when a prospect replies, so the
 * inbox is "ready". Only for actionable intents (interested/question), gated by
 * `reply_autosuggest_enabled` (default on). Never sends — the user still reviews,
 * edits and approves in /review. Failures are swallowed (on-demand generation in
 * the UI remains available).
 */
export async function maybeSuggestReply(input: SuggestInput): Promise<void> {
  if (getSetting("reply_autosuggest_enabled") === "false") return;
  if (input.intent !== "interested" && input.intent !== "question") return;
  if (!input.body || !input.body.trim()) return;

  try {
    const agencyProfileId = input.campaignId
      ? db.select({ id: campaigns.agencyProfileId }).from(campaigns).where(eq(campaigns.id, input.campaignId)).get()?.id ?? null
      : null;

    const suggestion = await draftConversationReply({
      leadId: input.leadId,
      channel: input.channel,
      latestInboundText: input.body,
      agencyProfileId,
      leadName: input.leadName ?? null,
      leadCategory: input.leadCategory ?? null,
    });

    if (suggestion) {
      db.update(replies)
        .set({ suggestedReply: suggestion, suggestedReplyAt: new Date().toISOString() })
        .where(eq(replies.id, input.replyId))
        .run();
    }
  } catch {
    /* best-effort — the user can still generate the suggestion on demand */
  }
}
