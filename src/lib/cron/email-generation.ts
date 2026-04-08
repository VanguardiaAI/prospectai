import { db, getSetting } from "@/db";
import { jobQueue, leads, emails, campaigns, abVariants, abResults } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import { generateEmail, detectCountryFromPhone, defaultWebAnalysis } from "@/lib/ai";
import type { WebAnalysis } from "@/lib/ai";
import { logActivity } from "@/lib/activity";
import { isBlacklisted } from "@/lib/blacklist";
import { isUnsubscribed } from "@/lib/unsubscribe";

export async function processEmailGenerationJobs() {
  const jobs = db.select().from(jobQueue)
    .where(and(eq(jobQueue.type, "generate_email"), eq(jobQueue.status, "pending")))
    .limit(5)
    .all();

  let processed = 0;
  for (const job of jobs) {
    if (!job.leadId) continue;

    db.update(jobQueue).set({ status: "processing" }).where(eq(jobQueue.id, job.id)).run();

    const lead = db.select().from(leads).where(eq(leads.id, job.leadId)).get();
    if (!lead) continue;

    // Blacklist check
    const toEmailCheck = lead.contactEmail || lead.extractedEmail || lead.email;
    if (isBlacklisted(toEmailCheck, lead.website, lead.name)) {
      db.update(jobQueue).set({ status: "failed", errorMessage: "Blacklisted" }).where(eq(jobQueue.id, job.id)).run();
      logActivity("email_failed", `Email no generado para ${lead.name}: en blacklist`, { leadId: lead.id, messageKey: "activityLog.leadBlacklisted", messageVars: { name: lead.name } });
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
      const fromEmail = getSetting("from_email") || "";
      const toEmail = lead.contactEmail || lead.extractedEmail || lead.email;

      if (!toEmail) {
        db.update(jobQueue).set({ status: "failed", errorMessage: "No email address" }).where(eq(jobQueue.id, job.id)).run();
        continue;
      }

      // RGPD: Check if email is unsubscribed
      if (isUnsubscribed(toEmail)) {
        db.update(jobQueue).set({ status: "failed", errorMessage: "Email unsubscribed" }).where(eq(jobQueue.id, job.id)).run();
        logActivity("email_failed", `Email no generado para ${lead.name}: ${toEmail} se dio de baja`, { leadId: lead.id, messageKey: "activityLog.leadUnsubscribed", messageVars: { name: lead.name } });
        continue;
      }

      // A/B Testing: Check if campaign has active test
      let abVariantGroup: "A" | "B" | null = null;
      let abTestId: number | null = null;
      let abCustomInstructions: string | undefined;

      if (lead.campaignId) {
        const activeTest = db.select().from(abVariants)
          .where(and(eq(abVariants.campaignId, lead.campaignId), eq(abVariants.status, "active"), sql`${abVariants.channel} IN ('email', 'both')`))
          .get();

        if (activeTest) {
          abTestId = activeTest.id;
          abVariantGroup = Math.random() < 0.5 ? "A" : "B";
          const config = JSON.parse(abVariantGroup === "A" ? activeTest.variantA : activeTest.variantB);
          if (config.tone) tone = config.tone;
          if (config.instructions) abCustomInstructions = config.instructions;
        }
      }

      const generated = await generateEmail(
        lead.name, lead.category, lead.city, lead.website, analysis, tone, fromName,
        undefined, abCustomInstructions, detectCountryFromPhone(lead.phone) || undefined
      );

      db.insert(emails).values({
        leadId: lead.id,
        campaignId: lead.campaignId,
        toEmail,
        fromEmail,
        subject: generated.subject,
        bodyHtml: generated.bodyHtml,
        bodyText: generated.bodyText,
        tone,
        status: "draft",
      }).run();

      // Record A/B test assignment
      if (abTestId && abVariantGroup) {
        const lastEmail = db.select().from(emails)
          .where(eq(emails.leadId, lead.id))
          .orderBy(sql`id DESC`)
          .limit(1)
          .get();

        if (lastEmail) {
          db.insert(abResults).values({
            variantId: abTestId,
            emailId: lastEmail.id,
            variantGroup: abVariantGroup,
          }).run();
        }
      }

      db.update(leads).set({ status: "email_generated" }).where(eq(leads.id, lead.id)).run();

      // If autopilot, auto-approve
      const autopilotGlobal = getSetting("autopilot_global") === "true";
      const autopilotCampaign = campaign?.autopilot ?? false;

      if (autopilotGlobal || autopilotCampaign) {
        const email = db.select().from(emails).where(eq(emails.leadId, lead.id)).get();
        if (email) {
          db.update(emails).set({ status: "approved" }).where(eq(emails.id, email.id)).run();
          db.update(leads).set({ status: "email_approved" }).where(eq(leads.id, lead.id)).run();
          db.insert(jobQueue).values({
            type: "send_email",
            leadId: lead.id,
            campaignId: lead.campaignId,
          }).run();
        }
      }

      logActivity("email_generated", `Email generado para ${lead.name}`, {
        leadId: lead.id,
        campaignId: lead.campaignId ?? undefined,
        messageKey: "activityLog.emailGeneratedFor",
        messageVars: { name: lead.name },
      });

      db.update(jobQueue).set({ status: "completed", processedAt: new Date().toISOString() }).where(eq(jobQueue.id, job.id)).run();
      processed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      db.update(jobQueue).set({ status: "failed", errorMessage: errorMsg }).where(eq(jobQueue.id, job.id)).run();
      logActivity("error", `Error generando email para ${lead?.name}: ${errorMsg}`, { leadId: job.leadId ?? undefined, messageKey: "activityLog.errorGeneratingEmail", messageVars: { name: lead?.name ?? "unknown" } });
    }
  }
  return processed;
}
