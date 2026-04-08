import { db, getSetting } from "@/db";
import { jobQueue, leads, campaigns } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { scrapeWebsite } from "@/lib/scraper";
import { analyzeWebsite } from "@/lib/ai";
import { calculateOpportunityScore } from "@/lib/scorer";
import { logActivity } from "@/lib/activity";

export async function processScrapeJobs(concurrency: number, delayMs: number, maxJobs?: number) {
  let processed = 0;

  // Loop in batches until no more pending jobs (or maxJobs reached)
  while (true) {
    const remaining = maxJobs != null ? maxJobs - processed : concurrency;
    if (maxJobs != null && remaining <= 0) break;

    const batchSize = Math.min(concurrency, maxJobs != null ? remaining : concurrency);
    const jobs = db.select().from(jobQueue)
      .where(and(eq(jobQueue.type, "scrape"), eq(jobQueue.status, "pending")))
      .limit(batchSize)
      .all();

    if (jobs.length === 0) break;

  for (const job of jobs) {
    if (!job.leadId) continue;

    db.update(jobQueue).set({ status: "processing" }).where(eq(jobQueue.id, job.id)).run();
    db.update(leads).set({ status: "scraping" }).where(eq(leads.id, job.leadId)).run();

    const lead = db.select().from(leads).where(eq(leads.id, job.leadId)).get();
    if (!lead || !lead.website) {
      db.update(jobQueue).set({ status: "completed", processedAt: new Date().toISOString() }).where(eq(jobQueue.id, job.id)).run();
      continue;
    }

    try {
      const result = await scrapeWebsite(lead.website);

      if (result.success) {
        const updates: Record<string, unknown> = {
          status: "scraped" as const,
          scrapedAt: new Date().toISOString(),
        };

        if (result.emails && result.emails.length > 0) {
          updates.extractedEmail = result.emails[0];
          if (!lead.contactEmail && !lead.email) {
            updates.contactEmail = result.emails[0];
          }
        }

        db.update(leads).set(updates).where(eq(leads.id, lead.id)).run();

        // Now analyze
        db.update(leads).set({ status: "analyzing" }).where(eq(leads.id, lead.id)).run();

        const analysis = await analyzeWebsite(
          lead.name,
          lead.category,
          lead.website,
          result.content || "",
          result.meta || {}
        );

        const updatedLead = db.select().from(leads).where(eq(leads.id, lead.id)).get()!;
        const opportunityScore = calculateOpportunityScore({
          website: lead.website,
          webQualityScore: analysis.qualityScore,
          reviewCount: lead.reviewCount,
          rating: lead.rating,
          category: lead.category,
          email: lead.email,
          extractedEmail: updatedLead.extractedEmail,
        }, analysis);

        db.update(leads).set({
          status: "analyzed",
          webQualityScore: analysis.qualityScore,
          opportunityScore,
          analysisJson: JSON.stringify(analysis),
          analysisSummary: analysis.summary,
          analyzedAt: new Date().toISOString(),
          extractedEmail: analysis.extractedEmails?.[0] || updatedLead.extractedEmail,
        }).where(eq(leads.id, lead.id)).run();

        // Check if should auto-generate email based on campaign threshold
        const campaign = lead.campaignId
          ? db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).get()
          : null;

        const threshold = campaign?.qualityThreshold ?? parseInt(getSetting("quality_threshold") || "40");
        const contactEmail = updatedLead.contactEmail || updatedLead.extractedEmail || lead.email;

        if (analysis.qualityScore <= threshold && contactEmail) {
          db.insert(jobQueue).values({
            type: "generate_email",
            leadId: lead.id,
            campaignId: lead.campaignId,
          }).run();
        }

        // Queue WA generation if lead has phone
        if (analysis.qualityScore <= threshold && lead.phone) {
          db.insert(jobQueue).values({
            type: "generate_wa",
            leadId: lead.id,
            campaignId: lead.campaignId,
          }).run();
        }

        logActivity("scrape", `Scrapeado y analizado: ${lead.name} (calidad: ${analysis.qualityScore}/100, SEO: ${analysis.seoScore ?? "N/A"}/100)`, {
          leadId: lead.id,
          campaignId: lead.campaignId ?? undefined,
          messageKey: "activityLog.scrapeAnalyzed",
          messageVars: { name: lead.name, score: analysis.qualityScore, seo: analysis.seoScore ?? "N/A" },
        });

        db.update(jobQueue).set({ status: "completed", processedAt: new Date().toISOString() }).where(eq(jobQueue.id, job.id)).run();
      } else {
        throw new Error(result.error || "Scrape failed");
      }
    } catch (err) {
      const attempts = (job.attempts || 0) + 1;
      const errorMsg = err instanceof Error ? err.message : "Unknown error";

      if (attempts >= job.maxAttempts) {
        db.update(jobQueue).set({ status: "failed", attempts, errorMessage: errorMsg }).where(eq(jobQueue.id, job.id)).run();
        db.update(leads).set({ status: "error", errorMessage: errorMsg }).where(eq(leads.id, job.leadId)).run();
        logActivity("error", `Error scrapeando ${lead.name}: ${errorMsg}`, { leadId: lead.id, messageKey: "activityLog.errorScraping", messageVars: { name: lead.name } });
      } else {
        db.update(jobQueue).set({ status: "pending", attempts, errorMessage: errorMsg }).where(eq(jobQueue.id, job.id)).run();
        db.update(leads).set({ status: "imported" }).where(eq(leads.id, job.leadId)).run();
      }
    }

    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    processed++;
  }
  } // end while
  return processed;
}
