import { db } from "@/db";
import { emails, whatsappMessages, replies } from "@/db/schema";
import { eq } from "drizzle-orm";

/** One message in a lead conversation, normalized across channels and direction. */
export interface ConversationTurn {
  direction: "out" | "in"; // out = sent by us, in = the prospect's reply
  channel: "email" | "whatsapp";
  text: string;
  at: string; // ISO timestamp used for ordering
  subject?: string | null;
}

interface MergeInput {
  emails: { subject: string | null; bodyText: string; sentAt: string | null; createdAt: string; status: string }[];
  waMessages: { body: string; sentAt: string | null; createdAt: string; status: string }[];
  replies: { channel: "email" | "whatsapp"; body: string | null; receivedAt: string }[];
}

/**
 * Merge outbound emails/WhatsApp and inbound replies into a single time-ordered
 * thread. Only actually-sent outbound rows count as conversation (drafts/held are
 * ignored). Pure — no DB access — so it is trivially unit-testable.
 */
export function mergeConversation(input: MergeInput): ConversationTurn[] {
  const turns: ConversationTurn[] = [];
  for (const e of input.emails) {
    if (e.status !== "sent") continue;
    turns.push({ direction: "out", channel: "email", text: e.bodyText || "", at: e.sentAt || e.createdAt, subject: e.subject });
  }
  for (const w of input.waMessages) {
    if (w.status !== "sent") continue;
    turns.push({ direction: "out", channel: "whatsapp", text: w.body || "", at: w.sentAt || w.createdAt });
  }
  for (const r of input.replies) {
    turns.push({ direction: "in", channel: r.channel, text: r.body || "", at: r.receivedAt });
  }
  turns.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
  return turns;
}

/** Render a thread for an AI prompt. Each turn is capped so the prompt stays bounded. */
export function formatConversation(turns: ConversationTurn[], usAlias: string, themAlias: string, perTurnChars = 800): string {
  return turns
    .map((t) => {
      const who = t.direction === "out" ? usAlias : themAlias;
      const ch = t.channel === "email" ? "Email" : "WhatsApp";
      return `[${ch}] ${who}: ${(t.text || "").trim().slice(0, perTurnChars)}`;
    })
    .join("\n\n");
}

/** Fetch the full conversation for a lead, ordered oldest → newest. */
export function getLeadConversation(leadId: number): ConversationTurn[] {
  const e = db
    .select({
      subject: emails.subject,
      bodyText: emails.bodyText,
      sentAt: emails.sentAt,
      createdAt: emails.createdAt,
      status: emails.status,
    })
    .from(emails)
    .where(eq(emails.leadId, leadId))
    .all();
  const w = db
    .select({
      body: whatsappMessages.body,
      sentAt: whatsappMessages.sentAt,
      createdAt: whatsappMessages.createdAt,
      status: whatsappMessages.status,
    })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.leadId, leadId))
    .all();
  const r = db
    .select({ channel: replies.channel, body: replies.body, receivedAt: replies.receivedAt })
    .from(replies)
    .where(eq(replies.leadId, leadId))
    .all();
  return mergeConversation({ emails: e, waMessages: w, replies: r });
}

/** Subject for an email reply: reuse the most recent outbound subject as "Re: …". */
export function getReplySubject(turns: ConversationTurn[]): string {
  const lastEmail = [...turns].reverse().find((t) => t.channel === "email" && t.direction === "out" && t.subject);
  const base = (lastEmail?.subject || "").trim();
  if (!base) return "Re:";
  return /^re:/i.test(base) ? base : `Re: ${base}`;
}
