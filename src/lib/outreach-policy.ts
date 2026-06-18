// Channel policy for first-touch outreach.
//
// One company (lead) is contacted on ONE channel at a time — never email AND
// WhatsApp simultaneously. Email is the primary channel; WhatsApp is the
// fallback, generated as a parked "held" message that only goes out if the
// email got no reply after a delay (or is released manually). This module is
// the single source of truth for those rules so the cron jobs stay consistent.

import { db, getSetting } from "@/db";
import { emails, whatsappMessages, leads, replies, campaigns } from "@/db/schema";
import { eq, and, desc, inArray } from "drizzle-orm";
import { parseChannels } from "@/services/campaign.service";

// Days to wait after the primary (email) before the WhatsApp fallback is
// released automatically. Configurable via the `fallback_delay_days` setting.
export const DEFAULT_FALLBACK_DELAY_DAYS = 3;

export function getFallbackDelayDays(): number {
  const raw = parseInt(getSetting("fallback_delay_days") || "", 10);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_FALLBACK_DELAY_DAYS;
}

// Statuses that mean "this message has not gone out yet" — eligible to be
// cancelled when the lead replies on any channel.
const PENDING_MESSAGE_STATUSES = ["held", "draft", "approved"] as const;

/**
 * Has this lead already responded on any channel? Any inbound reply (email or
 * WhatsApp) stops further outreach — we never contact someone who answered.
 */
export function leadHasReplied(leadId: number): boolean {
  const lead = db.select({ status: leads.status }).from(leads).where(eq(leads.id, leadId)).get();
  if (lead?.status === "replied") return true;
  const reply = db.select({ id: replies.id }).from(replies).where(eq(replies.leadId, leadId)).limit(1).get();
  return !!reply;
}

/**
 * Cancel any not-yet-sent outreach for a lead (the parked WhatsApp fallback and
 * any pending email/WhatsApp draft/approved). Called from the reply choke point
 * so a reply on one channel stops the other. Idempotent: only touches messages
 * still in a pending state, never anything already `sent`.
 */
export function cancelPendingOutreachOnReply(leadId: number): void {
  const now = new Date().toISOString();
  db.update(whatsappMessages)
    .set({ status: "rejected", updatedAt: now })
    .where(and(eq(whatsappMessages.leadId, leadId), inArray(whatsappMessages.status, [...PENDING_MESSAGE_STATUSES])))
    .run();
  db.update(emails)
    .set({ status: "rejected", updatedAt: now })
    .where(and(eq(emails.leadId, leadId), inArray(emails.status, [...PENDING_MESSAGE_STATUSES])))
    .run();
}

// Parse a timestamp that may be ISO-8601 ("…T…Z", from toISOString) or SQLite's
// `datetime('now')` UTC format ("YYYY-MM-DD HH:MM:SS"). Returns epoch millis.
function parseDbTime(ts: string): number {
  const normalized = ts.includes("T") ? ts : ts.replace(" ", "T") + "Z";
  return new Date(normalized).getTime();
}

/** True if `ts` is at least `days` days in the past. */
export function isOlderThanDays(ts: string | null | undefined, days: number): boolean {
  if (!ts) return false;
  return parseDbTime(ts) <= Date.now() - days * 24 * 60 * 60 * 1000;
}

/**
 * Is WhatsApp the FALLBACK channel for this lead (vs the primary)? True when the
 * campaign uses email AND the lead has an email address — i.e. email goes first
 * and WhatsApp only backs it up. False for WhatsApp-only campaigns / phone-only
 * leads, where WhatsApp IS the primary and sends normally.
 */
export function whatsappIsFallback(leadId: number): boolean {
  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) return false;
  const campaign = lead.campaignId
    ? db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).get()
    : null;
  const leadEmail = lead.contactEmail || lead.extractedEmail || lead.email;
  return parseChannels(campaign?.channels).includes("email") && !!leadEmail;
}

export type FallbackDecision = "send" | "wait" | "cancel";

/**
 * For a WhatsApp FALLBACK, decide whether it should go out now. Email-first:
 *   - "cancel" — the lead replied; never contact again.
 *   - "send"   — primary email is done with (sent ≥ delay days ago, or exhausted).
 *   - "wait"   — primary email is still pending or within the no-reply window.
 * `heldSince` is the fallback's createdAt, used only when no email row exists.
 */
export function whatsappFallbackDecision(leadId: number, heldSince?: string | null): FallbackDecision {
  if (leadHasReplied(leadId)) return "cancel";

  const delayDays = getFallbackDelayDays();
  const email = db.select().from(emails)
    .where(eq(emails.leadId, leadId))
    .orderBy(desc(emails.id))
    .get();

  if (email) {
    if (email.status === "sent") return isOlderThanDays(email.sentAt, delayDays) ? "send" : "wait";
    if (email.status === "failed" || email.status === "rejected") return "send"; // primary exhausted
    return "wait"; // draft / approved / held → primary still pending
  }
  // Email expected but never produced (unsubscribe/blacklist/error) → fall back
  // once the message has waited the delay.
  return isOlderThanDays(heldSince, delayDays) ? "send" : "wait";
}
