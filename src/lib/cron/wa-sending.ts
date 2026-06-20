import { db } from "@/db";
import { whatsappMessages, leads } from "@/db/schema";
import { eq, and, sql, or, isNull, lte } from "drizzle-orm";
import { sendWhatsAppMessage, isWhatsAppReady } from "@/lib/whatsapp-client";
import { logActivity } from "@/lib/activity";
import { isWithinSendWindow, getWhatsAppDailyLimit, incrementWhatsAppWarmupDay } from "./warmup";
import { withSendLock } from "./send-lock";
import { leadHasReplied, whatsappIsFallback, whatsappFallbackDecision } from "@/lib/outreach-policy";
import { wasCompanyContacted } from "@/lib/contact-history";

type WaSendResult = { sent: number; reason?: string };

export async function processWhatsAppSending(): Promise<WaSendResult> {
  // Single-writer lock: never let two passes run at once, or they would both
  // read the same "sent today" count and each send up to the remaining cap.
  return withSendLock<WaSendResult>(
    "send_wa",
    { sent: 0, reason: "Another WhatsApp send pass is already running" },
    runWhatsAppSending,
  );
}

async function runWhatsAppSending(): Promise<WaSendResult> {
  if (!isWhatsAppReady()) {
    return { sent: 0, reason: "WhatsApp not connected" };
  }

  if (!isWithinSendWindow()) {
    return { sent: 0, reason: "Outside send window" };
  }

  // Only act on approved messages whose scheduled time is due (NULL = legacy/asap).
  const nowIso = new Date().toISOString();
  const dueApproved = and(
    eq(whatsappMessages.status, "approved"),
    or(isNull(whatsappMessages.scheduledFor), lte(whatsappMessages.scheduledFor, nowIso)),
  );

  // Advance the WhatsApp warm-up ramp for a new active sending day before reading
  // the limit (gated on there being DUE approved messages), so a fresh number
  // ramps gently and the limit never jumps mid-day.
  const hasApproved = !!db.select({ id: whatsappMessages.id }).from(whatsappMessages)
    .where(dueApproved).limit(1).get();
  if (hasApproved) incrementWhatsAppWarmupDay();

  const waLimit = getWhatsAppDailyLimit();
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
    .where(dueApproved)
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
        errorMessage: null,
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
      // "not_registered" = the number is not on WhatsApp -> permanent failure.
      // "not_connected"/"send_error" = transient -> keep it approved so the next
      // pass retries it instead of burning the message. Persist the reason either
      // way so it is visible on the message, not only in the activity log.
      const permanent = result.reason === "not_registered";
      db.update(whatsappMessages).set({
        status: permanent ? "failed" : "approved",
        errorMessage: result.error ?? null,
        updatedAt: new Date().toISOString(),
      }).where(eq(whatsappMessages.id, msg.id)).run();

      logActivity("wa_failed", `Error enviando WhatsApp a ${msg.toPhone}: ${result.error}`, {
        leadId: msg.leadId,
        messageKey: "activityLog.errorSendingWa",
        messageVars: { phone: msg.toPhone },
      });

      // If the client dropped mid-pass, stop — the remaining sends would just
      // fail the same way and retry next window.
      if (result.reason === "not_connected") break;
    }

    // Stagger: wait 30-90 seconds between messages
    const delay = 30000 + Math.random() * 60000;
    await new Promise((r) => setTimeout(r, delay));
  }

  return { sent };
}
