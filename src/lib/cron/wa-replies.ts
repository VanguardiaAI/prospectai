import { db } from "@/db";
import { leads, sequenceEnrollments, replies } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getClient } from "@/lib/whatsapp-client";
import { logActivity } from "@/lib/activity";
import { triggerCrmWebhook } from "@/lib/crm-webhook";
import { prioritizeLeadOnReply } from "@/lib/lead-prioritization";
import { logger } from "@/lib/logger";

// Track which client instance has the listener to avoid duplicates.
let waListenerClient: ReturnType<typeof getClient> = null;

export function setupWhatsAppReplyListener(): void {
  const waClient = getClient();
  if (!waClient) return;

  // Already registered on this exact client instance — skip.
  if (waListenerClient === waClient) return;

  waListenerClient = waClient;

  waClient.on("message", async (msg) => {
    try {
      // Resolve the sender's real phone number. msg.from can be a LID
      // ("<id>@lid", WhatsApp privacy addressing) rather than "<number>@c.us",
      // so prefer the contact's number. Match leads on the last 10 digits to
      // sidestep country-prefix differences (e.g. Mexico's 52 vs 521).
      const contact = await msg.getContact().catch(() => null);
      const rawFrom = (contact?.number || msg.from).replace(/\D/g, "");
      const last10 = rawFrom.slice(-10);
      logger.info({ from: msg.from, contactNumber: contact?.number ?? null, last10 }, "WhatsApp incoming message");
      if (!last10) return;

      // Find lead by phone number (last 10 digits)
      const lead = db.select().from(leads)
        .where(sql`REPLACE(REPLACE(REPLACE(${leads.phone}, ' ', ''), '-', ''), '+', '') LIKE '%' || ${last10}`)
        .get();

      if (!lead) return;

      // Record the reply
      db.insert(replies).values({
        leadId: lead.id,
        campaignId: lead.campaignId,
        channel: "whatsapp",
        fromAddress: rawFrom,
        body: msg.body,
      }).run();

      // Stop active sequences
      db.update(sequenceEnrollments)
        .set({ status: "replied", completedAt: new Date().toISOString() })
        .where(and(
          eq(sequenceEnrollments.leadId, lead.id),
          eq(sequenceEnrollments.status, "active")
        ))
        .run();

      // Prioritize lead: set status to "replied", boost opportunityScore
      prioritizeLeadOnReply(lead.id);

      logActivity("wa_sent", `Respuesta WhatsApp recibida de ${lead.name} (${rawFrom})`, {
        leadId: lead.id,
        campaignId: lead.campaignId ?? undefined,
        messageKey: "activityLog.waSentTo",
        messageVars: { phone: rawFrom },
      });

      // CRM webhook
      await triggerCrmWebhook(lead, "replied");
    } catch {
      // Silently ignore individual reply processing errors
    }
  });
}
