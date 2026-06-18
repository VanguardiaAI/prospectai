import { db } from "@/db";
import { whatsappMessages, leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { whatsappFallbackDecision } from "@/lib/outreach-policy";
import { computeScheduledFor } from "./send-schedule";

/**
 * Channel fallback: release parked ("held") WhatsApp messages to the send queue
 * when the primary email got no reply.
 *
 * For each held WhatsApp, {@link whatsappFallbackDecision} decides:
 *   - "send"   → release (held → approved); the WhatsApp sender picks it up.
 *   - "cancel" → the lead replied; drop the fallback, never contact again.
 *   - "wait"   → primary email still pending / within the no-reply window.
 *
 * This guarantees the two channels are never sent at the same time: email
 * first, WhatsApp only after — and only if there was no reply.
 */
export async function processChannelFallback() {
  const held = db.select().from(whatsappMessages).where(eq(whatsappMessages.status, "held")).all();

  let released = 0;
  let cancelled = 0;

  for (const msg of held) {
    const now = new Date().toISOString();
    const decision = whatsappFallbackDecision(msg.leadId, msg.createdAt);

    if (decision === "wait") continue;

    if (decision === "cancel") {
      db.update(whatsappMessages).set({ status: "rejected", updatedAt: now }).where(eq(whatsappMessages.id, msg.id)).run();
      cancelled++;
      continue;
    }

    // decision === "send": release the fallback into the scheduled send window
    // (not instantly — it rides the same 10-12 slot as everything else).
    db.update(whatsappMessages).set({ status: "approved", scheduledFor: computeScheduledFor(), updatedAt: now }).where(eq(whatsappMessages.id, msg.id)).run();

    // Reflect the now-active channel on the lead (without clobbering a reply).
    const lead = db.select().from(leads).where(eq(leads.id, msg.leadId)).get();
    if (lead && lead.status !== "replied") {
      db.update(leads).set({ status: "wa_approved" }).where(eq(leads.id, msg.leadId)).run();
    }

    logActivity("wa_approved", `Respaldo WhatsApp liberado para ${lead?.name ?? `lead #${msg.leadId}`} (email sin respuesta)`, {
      leadId: msg.leadId,
      campaignId: msg.campaignId ?? undefined,
      messageKey: "activityLog.waApproved",
    });
    released++;
  }

  return { released, cancelled };
}
