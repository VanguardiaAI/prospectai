import { db, getSetting } from "@/db";
import { jobQueue, leads, campaigns, whatsappMessages, abVariants, abResults } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { generateWhatsApp, detectCountryFromPhone, defaultWebAnalysis } from "@/lib/ai";
import type { WebAnalysis } from "@/lib/ai";
import { logActivity } from "@/lib/activity";
import { isBlacklisted } from "@/lib/blacklist";
import { withStrategyDirective } from "@/lib/ai/strategy";

export async function processWhatsAppGenerationJobs() {
  const jobs = db.select().from(jobQueue)
    .where(and(eq(jobQueue.type, "generate_wa"), eq(jobQueue.status, "pending")))
    .limit(5)
    .all();

  let processed = 0;
  for (const job of jobs) {
    if (!job.leadId) continue;

    db.update(jobQueue).set({ status: "processing" }).where(eq(jobQueue.id, job.id)).run();

    const lead = db.select().from(leads).where(eq(leads.id, job.leadId)).get();
    if (!lead) continue;

    // Blacklist check
    if (isBlacklisted(lead.email, lead.website, lead.name)) {
      db.update(jobQueue).set({ status: "failed", errorMessage: "Blacklisted" }).where(eq(jobQueue.id, job.id)).run();
      logActivity("wa_failed", `WA no generado para ${lead.name}: en blacklist`, { leadId: lead.id, messageKey: "activityLog.leadBlacklisted", messageVars: { name: lead.name } });
      continue;
    }

    if (!lead.phone) {
      db.update(jobQueue).set({ status: "failed", errorMessage: "No phone" }).where(eq(jobQueue.id, job.id)).run();
      continue;
    }

    try {
      const analysis: WebAnalysis = lead.analysisJson
        ? JSON.parse(lead.analysisJson)
        : defaultWebAnalysis(lead.website, lead.webQualityScore || 0, lead.analysisSummary || "");

      const campaign = lead.campaignId
        ? db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).get()
        : null;

      let tone = campaign?.defaultTone || getSetting("default_tone") || "professional";
      const fromName = getSetting("from_name") || getSetting("agency_name") || "ProspectAI";

      // A/B Testing: Check if campaign has active WA test
      let abVariantGroup: "A" | "B" | null = null;
      let abTestId: number | null = null;
      let abCustomInstructions: string | undefined;

      if (lead.campaignId) {
        const activeTest = db.select().from(abVariants)
          .where(and(eq(abVariants.campaignId, lead.campaignId), eq(abVariants.status, "active"), sql`${abVariants.channel} IN ('whatsapp', 'both')`))
          .get();

        if (activeTest) {
          abTestId = activeTest.id;
          abVariantGroup = Math.random() < 0.5 ? "A" : "B";
          const config = JSON.parse(abVariantGroup === "A" ? activeTest.variantA : activeTest.variantB);
          if (config.tone) tone = config.tone;
          if (config.instructions) abCustomInstructions = config.instructions;
        }
      }

      const generated = await generateWhatsApp(
        lead.name, lead.category, lead.city, lead.website, analysis, tone, fromName,
        undefined, withStrategyDirective(campaign?.strategy, abCustomInstructions), detectCountryFromPhone(lead.phone) || undefined,
        campaign?.agencyProfileId ?? undefined
      );

      db.insert(whatsappMessages).values({
        leadId: lead.id,
        campaignId: lead.campaignId,
        toPhone: lead.phone,
        body: generated.message,
        tone,
        status: "draft",
      }).run();

      // Record A/B test assignment for WA
      if (abTestId && abVariantGroup) {
        const lastWa = db.select().from(whatsappMessages)
          .where(eq(whatsappMessages.leadId, lead.id))
          .orderBy(sql`id DESC`)
          .limit(1)
          .get();

        if (lastWa) {
          db.insert(abResults).values({
            variantId: abTestId,
            whatsappMessageId: lastWa.id,
            variantGroup: abVariantGroup,
          }).run();
        }
      }

      // Guard: don't overwrite email-track statuses
      const currentLead = db.select().from(leads).where(eq(leads.id, lead.id)).get();
      if (currentLead && !["email_generated", "email_approved", "email_sent"].includes(currentLead.status)) {
        db.update(leads).set({ status: "wa_generated" }).where(eq(leads.id, lead.id)).run();
      }

      // Autopilot: auto-approve
      const autopilotGlobal = getSetting("autopilot_global") === "true";
      const autopilotCampaign = campaign?.autopilot ?? false;

      if (autopilotGlobal || autopilotCampaign) {
        const waMsg = db.select().from(whatsappMessages)
          .where(and(eq(whatsappMessages.leadId, lead.id), eq(whatsappMessages.status, "draft")))
          .orderBy(sql`id DESC`)
          .limit(1)
          .get();
        if (waMsg) {
          db.update(whatsappMessages).set({ status: "approved" }).where(eq(whatsappMessages.id, waMsg.id)).run();
          const cl = db.select().from(leads).where(eq(leads.id, lead.id)).get();
          if (cl && !["email_generated", "email_approved", "email_sent"].includes(cl.status)) {
            db.update(leads).set({ status: "wa_approved" }).where(eq(leads.id, lead.id)).run();
          }
        }
      }

      logActivity("wa_generated", `WhatsApp generado para ${lead.name}`, {
        leadId: lead.id,
        campaignId: lead.campaignId ?? undefined,
        messageKey: "activityLog.waGeneratedFor",
        messageVars: { name: lead.name },
      });

      db.update(jobQueue).set({ status: "completed", processedAt: new Date().toISOString() }).where(eq(jobQueue.id, job.id)).run();
      processed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      db.update(jobQueue).set({ status: "failed", errorMessage: errorMsg }).where(eq(jobQueue.id, job.id)).run();
      logActivity("error", `Error generando WA para ${lead?.name}: ${errorMsg}`, { leadId: job.leadId ?? undefined, messageKey: "activityLog.errorGeneratingWa", messageVars: { name: lead?.name ?? "unknown" } });
    }
  }
  return processed;
}
