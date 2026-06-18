import { db, getSetting } from "@/db";
import { whatsappMessages, leads } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { sendWhatsAppMessage, isWhatsAppReady } from "@/lib/whatsapp-client";
import { logActivity } from "@/lib/activity";
import { isWithinSendWindow } from "./warmup";
import { leadHasReplied, whatsappIsFallback, whatsappFallbackDecision } from "@/lib/outreach-policy";
import { wasCompanyContacted } from "@/lib/contact-history";

export async function processWhatsAppSending() {
  if (!isWhatsAppReady()) {
    return { sent: 0, reason: "WhatsApp not connected" };
  }

  if (!isWithinSendWindow()) {
    return { sent: 0, reason: "Outside send window" };
  }

  const waLimit = parseInt(getSetting("wa_daily_limit") || "20");
  const today = new Date().toISOString().split("T")[0];

  const sentToday = db.select({ count: sql<number>`count(*)` }).from(whatsappMessages)
    .where(and(eq(whatsappMessages.status, "sent"), sql`date(${whatsappMessages.sentAt}) = ${today}`))
    .get()?.count ?? 0;

  if (sentToday >= waLimit) {
    return { sent: 0, reason: "WhatsApp daily limit reached" };
  }

  const remaining = waLimit - sentToday;

  const approvedMessages = db.select()
    .from(whatsappMessages)
    .where(eq(whatsappMessages.status, "approved"))
    .limit(remaining)
    .all();

  let sent = 0;
  for (const msg of approvedMessages) {
    // Safety net: never contact a lead that already replied on any channel.
    if (leadHasReplied(msg.leadId)) {
      db.update(whatsappMessages)
        .set({ status: "rejected", updatedAt: new Date().toISOString() })
        .where(eq(whatsappMessages.id, msg.id))
        .run();
      continue;
    }

    // Already-contacted guard: hold a second pitch to a company contacted via
    // another lead/campaign unless consciously approved (surfaced in review).
    if (!msg.dupAck && wasCompanyContacted(msg.leadId)) {
      continue;
    }

    // Email-first guard: if WhatsApp is the fallback for this lead, only send
    // once the primary email is done (sent ≥ delay days ago / exhausted). While
    // the email is still pending or within the no-reply window, park it again —
    // the two channels are never sent at the same time.
    if (whatsappIsFallback(msg.leadId) && whatsappFallbackDecision(msg.leadId, msg.createdAt) === "wait") {
      db.update(whatsappMessages)
        .set({ status: "held", updatedAt: new Date().toISOString() })
        .where(eq(whatsappMessages.id, msg.id))
        .run();
      continue;
    }

    const result = await sendWhatsAppMessage(msg.toPhone, msg.body);

    if (result.success) {
      db.update(whatsappMessages).set({
        status: "sent",
        waMessageId: result.messageId,
        sentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).where(eq(whatsappMessages.id, msg.id)).run();

      db.update(leads).set({
        status: "wa_sent",
        waSentAt: new Date().toISOString(),
      }).where(eq(leads.id, msg.leadId)).run();

      logActivity("wa_sent", `WhatsApp enviado a ${msg.toPhone}`, {
        leadId: msg.leadId,
        campaignId: msg.campaignId ?? undefined,
        messageKey: "activityLog.waSentTo",
        messageVars: { phone: msg.toPhone },
      });

      sent++;
    } else {
      db.update(whatsappMessages).set({
        status: "failed",
        updatedAt: new Date().toISOString(),
      }).where(eq(whatsappMessages.id, msg.id)).run();

      logActivity("wa_failed", `Error enviando WhatsApp a ${msg.toPhone}: ${result.error}`, {
        leadId: msg.leadId,
        messageKey: "activityLog.errorSendingWa",
        messageVars: { phone: msg.toPhone },
      });
    }

    // Stagger: wait 30-90 seconds between messages
    const delay = 30000 + Math.random() * 60000;
    await new Promise((r) => setTimeout(r, delay));
  }

  return { sent };
}
