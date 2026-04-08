import { db } from "@/db";
import { leads, sequenceEnrollments, replies } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { getClient } from "@/lib/whatsapp-client";
import { logActivity } from "@/lib/activity";
import { triggerCrmWebhook } from "@/lib/crm-webhook";
import { prioritizeLeadOnReply } from "@/lib/lead-prioritization";

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
      const from = msg.from.replace("@c.us", "");

      // Find lead by phone number
      const lead = db.select().from(leads)
        .where(sql`REPLACE(REPLACE(REPLACE(${leads.phone}, ' ', ''), '-', ''), '+', '') LIKE '%' || ${from}`)
        .get();

      if (!lead) return;

      // Record the reply
      db.insert(replies).values({
        leadId: lead.id,
        campaignId: lead.campaignId,
        channel: "whatsapp",
        fromAddress: from,
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

      logActivity("wa_sent", `Respuesta WhatsApp recibida de ${lead.name} (${from})`, {
        leadId: lead.id,
        campaignId: lead.campaignId ?? undefined,
        messageKey: "activityLog.waSentTo",
        messageVars: { phone: from },
      });

      // CRM webhook
      await triggerCrmWebhook(lead, "replied");
    } catch {
      // Silently ignore individual reply processing errors
    }
  });
}
