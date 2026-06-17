import { db, getSetting } from "@/db";
import { leads, emails, whatsappMessages, sequenceSteps, sequenceEnrollments, campaigns } from "@/db/schema";
import { eq, and, lte } from "drizzle-orm";
import { generateEmail, generateWhatsApp, detectCountryFromPhone, defaultWebAnalysis } from "@/lib/ai";
import type { WebAnalysis } from "@/lib/ai";
import { logActivity } from "@/lib/activity";
import { isUnsubscribed } from "@/lib/unsubscribe";
import { withStrategyDirective } from "@/lib/ai/strategy";

export async function processSequences() {
  const now = new Date().toISOString();

  const dueEnrollments = db.select()
    .from(sequenceEnrollments)
    .where(and(
      eq(sequenceEnrollments.status, "active"),
      lte(sequenceEnrollments.nextActionAt, now)
    ))
    .limit(20)
    .all();

  let processed = 0;

  for (const enrollment of dueEnrollments) {
    const step = db.select().from(sequenceSteps)
      .where(and(
        eq(sequenceSteps.campaignId, enrollment.campaignId),
        eq(sequenceSteps.stepNumber, enrollment.currentStep),
        eq(sequenceSteps.enabled, true),
      ))
      .get();

    if (!step) {
      db.update(sequenceEnrollments)
        .set({ status: "completed", completedAt: now })
        .where(eq(sequenceEnrollments.id, enrollment.id))
        .run();
      continue;
    }

    const lead = db.select().from(leads).where(eq(leads.id, enrollment.leadId)).get();
    if (!lead) continue;

    const campaign = db.select().from(campaigns).where(eq(campaigns.id, enrollment.campaignId)).get();

    const analysis: WebAnalysis = lead.analysisJson
      ? JSON.parse(lead.analysisJson)
      : defaultWebAnalysis(lead.website, lead.webQualityScore || 0, lead.analysisSummary || "");

    const fromName = getSetting("from_name") || getSetting("agency_name") || "ProspectAI";

    try {
      if (step.channel === "email") {
        const toEmail = lead.contactEmail || lead.extractedEmail || lead.email;
        if (!toEmail || isUnsubscribed(toEmail)) {
          db.update(sequenceEnrollments)
            .set({ status: "completed", completedAt: now })
            .where(eq(sequenceEnrollments.id, enrollment.id))
            .run();
          continue;
        }

        const generated = await generateEmail(
          lead.name, lead.category, lead.city, lead.website, analysis,
          step.tone, fromName, step.stepNumber, withStrategyDirective(campaign?.strategy, step.customInstructions),
          detectCountryFromPhone(lead.phone) || undefined, campaign?.agencyProfileId ?? undefined
        );

        const fromEmail = getSetting("from_email") || "";
        db.insert(emails).values({
          leadId: lead.id,
          campaignId: enrollment.campaignId,
          toEmail,
          fromEmail,
          subject: generated.subject,
          bodyHtml: generated.bodyHtml,
          bodyText: generated.bodyText,
          tone: step.tone,
          status: "draft",
        }).run();

        logActivity("email_generated", `Follow-up #${step.stepNumber} email generado para ${lead.name}`, {
          leadId: lead.id,
          campaignId: enrollment.campaignId,
          messageKey: "activityLog.followUpEmail",
          messageVars: { step: step.stepNumber, name: lead.name },
        });
      } else {
        // WhatsApp
        if (!lead.phone) {
          db.update(sequenceEnrollments)
            .set({ status: "completed", completedAt: now })
            .where(eq(sequenceEnrollments.id, enrollment.id))
            .run();
          continue;
        }

        const generated = await generateWhatsApp(
          lead.name, lead.category, lead.city, lead.website, analysis,
          step.tone, fromName, step.stepNumber, withStrategyDirective(campaign?.strategy, step.customInstructions),
          detectCountryFromPhone(lead.phone) || undefined, campaign?.agencyProfileId ?? undefined
        );

        db.insert(whatsappMessages).values({
          leadId: lead.id,
          campaignId: enrollment.campaignId,
          toPhone: lead.phone,
          body: generated.message,
          tone: step.tone,
          status: "draft",
        }).run();

        logActivity("wa_generated", `Follow-up #${step.stepNumber} WhatsApp generado para ${lead.name}`, {
          leadId: lead.id,
          campaignId: enrollment.campaignId,
          messageKey: "activityLog.followUpWa",
          messageVars: { step: step.stepNumber, name: lead.name },
        });
      }

      // Advance to next step
      const nextStepNumber = step.stepNumber + 1;
      const nextStep = db.select().from(sequenceSteps)
        .where(and(
          eq(sequenceSteps.campaignId, enrollment.campaignId),
          eq(sequenceSteps.stepNumber, nextStepNumber),
          eq(sequenceSteps.enabled, true),
        ))
        .get();

      if (nextStep) {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + nextStep.delayDays);
        db.update(sequenceEnrollments)
          .set({ currentStep: nextStepNumber, nextActionAt: nextDate.toISOString() })
          .where(eq(sequenceEnrollments.id, enrollment.id))
          .run();
      } else {
        db.update(sequenceEnrollments)
          .set({ status: "completed", completedAt: now })
          .where(eq(sequenceEnrollments.id, enrollment.id))
          .run();
      }

      processed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      logActivity("error", `Error en secuencia paso ${step.stepNumber} para ${lead.name}: ${errorMsg}`, {
        leadId: lead.id,
        campaignId: enrollment.campaignId,
        messageKey: "activityLog.sequenceError",
        messageVars: { step: step.stepNumber, name: lead.name },
      });
    }
  }

  return processed;
}
