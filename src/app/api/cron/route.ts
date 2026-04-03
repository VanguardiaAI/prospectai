import { NextRequest, NextResponse } from "next/server";
import { db, getSetting, setSetting } from "@/db";
import { jobQueue, leads, emails, campaigns, whatsappMessages, sequenceSteps, sequenceEnrollments, abVariants, abResults, sendingDomains, replies } from "@/db/schema";
import { eq, and, sql, lte, asc, ne } from "drizzle-orm";
import { scrapeWebsite } from "@/lib/scraper";
import { analyzeWebsite, generateEmail, generateWhatsApp, detectCountryFromPhone } from "@/lib/gemini";
import type { WebAnalysis } from "@/lib/gemini";
import { calculateOpportunityScore } from "@/lib/scorer";
import { sendEmail } from "@/lib/resend-client";
import { sendWhatsAppMessage, isWhatsAppReady, getClient } from "@/lib/whatsapp-client";
import { logActivity } from "@/lib/activity";
import { generateUnsubscribeUrl, isUnsubscribed, injectUnsubscribeLink, appendUnsubscribeText } from "@/lib/unsubscribe";
import { injectTrackingPixel, wrapLinksWithTracking } from "@/lib/tracking";
import { triggerCrmWebhook } from "@/lib/crm-webhook";
import { prioritizeLeadOnReply } from "@/lib/lead-prioritization";
import { isBlacklisted } from "@/lib/blacklist";

// --- Warmup & Send Window ---

function getEffectiveDailyLimit(): number {
  const globalLimit = parseInt(getSetting("global_daily_limit") || "50");

  // When sending domains exist, the effective limit is the sum of each domain's
  // own warmup-aware limit so new domains start at day 1 independently.
  const activeDomains = db.select().from(sendingDomains)
    .where(ne(sendingDomains.status, "paused"))
    .all();

  if (activeDomains.length > 0) {
    let total = 0;
    for (const d of activeDomains) {
      const day = d.warmupDay && d.warmupDay > 0 ? d.warmupDay : 1;
      total += Math.min(d.warmupStartLimit + (day - 1) * d.warmupIncrement, d.dailyLimit);
    }
    return Math.min(total, globalLimit);
  }

  // Fallback: no domains configured — use global warmup settings
  const warmupEnabled = getSetting("warmup_enabled") === "true";
  if (!warmupEnabled) return globalLimit;

  const warmupDay = parseInt(getSetting("warmup_day") || "1");
  const startLimit = parseInt(getSetting("warmup_start_limit") || "5");
  const increment = parseInt(getSetting("warmup_increment") || "5");
  const maxLimit = parseInt(getSetting("warmup_max_limit") || "50");

  const effectiveLimit = Math.min(startLimit + (warmupDay - 1) * increment, maxLimit);
  return Math.min(effectiveLimit, globalLimit);
}

function isWithinSendWindow(): boolean {
  const startHour = parseInt(getSetting("send_window_start") || "9");
  const endHour = parseInt(getSetting("send_window_end") || "18");
  const now = new Date();
  const hour = now.getHours();
  return hour >= startHour && hour < endHour;
}

// Increment warmup day (call once per day at first send)
function incrementWarmupDay(): void {
  if (getSetting("warmup_enabled") !== "true") return;
  const currentDay = parseInt(getSetting("warmup_day") || "1");
  const maxLimit = parseInt(getSetting("warmup_max_limit") || "50");
  const startLimit = parseInt(getSetting("warmup_start_limit") || "5");
  const increment = parseInt(getSetting("warmup_increment") || "5");

  // Check if already at max
  const currentLimit = startLimit + (currentDay - 1) * increment;
  if (currentLimit < maxLimit) {
    // Only increment if we haven't already incremented today
    const lastIncrement = getSetting("_warmup_last_increment");
    const today = new Date().toISOString().split("T")[0];
    if (lastIncrement !== today) {
      setSetting("warmup_day", String(currentDay + 1));
      setSetting("_warmup_last_increment", today);
    }
  }
}

// --- Process pending scrape jobs ---

async function processScrapeJobs(concurrency: number, delayMs: number) {
  const jobs = db.select().from(jobQueue)
    .where(and(eq(jobQueue.type, "scrape"), eq(jobQueue.status, "pending")))
    .limit(concurrency)
    .all();

  let processed = 0;
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
        logActivity("error", `Error scrapeando ${lead.name}: ${errorMsg}`, { leadId: lead.id });
      } else {
        db.update(jobQueue).set({ status: "pending", attempts, errorMessage: errorMsg }).where(eq(jobQueue.id, job.id)).run();
        db.update(leads).set({ status: "imported" }).where(eq(leads.id, job.leadId)).run();
      }
    }

    if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
    processed++;
  }
  return processed;
}

// --- Process email generation jobs ---

async function processEmailGenerationJobs() {
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
      logActivity("email_failed", `Email no generado para ${lead.name}: en blacklist`, { leadId: lead.id });
      continue;
    }

    try {
      const analysis: WebAnalysis = lead.analysisJson ? JSON.parse(lead.analysisJson) : {
        hasWebsite: !!lead.website, qualityScore: lead.webQualityScore || 0,
        issues: [], strengths: [], summary: lead.analysisSummary || "",
        isMobile: false, hasSSL: false, loadSpeed: "unknown" as const,
        designScore: 0, contentScore: 0, functionalityScore: 0, extractedEmails: [],
        seoScore: 50, seoIssues: [], googleBusinessOpportunities: [],
        socialMediaPresence: [], aiAgentOpportunities: [], recommendedServices: ["web_development"],
      };

      const campaign = lead.campaignId
        ? db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).get()
        : null;

      let tone = campaign?.defaultTone || getSetting("default_tone") || "profesional";
      const fromName = getSetting("from_name") || getSetting("agency_name") || "VanguardIA";
      const fromEmail = getSetting("from_email") || "hola@vanguardia.dev";
      const toEmail = lead.contactEmail || lead.extractedEmail || lead.email;

      if (!toEmail) {
        db.update(jobQueue).set({ status: "failed", errorMessage: "No email address" }).where(eq(jobQueue.id, job.id)).run();
        continue;
      }

      // RGPD: Check if email is unsubscribed
      if (isUnsubscribed(toEmail)) {
        db.update(jobQueue).set({ status: "failed", errorMessage: "Email unsubscribed" }).where(eq(jobQueue.id, job.id)).run();
        logActivity("email_failed", `Email no generado para ${lead.name}: ${toEmail} se dio de baja`, { leadId: lead.id });
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
      });

      db.update(jobQueue).set({ status: "completed", processedAt: new Date().toISOString() }).where(eq(jobQueue.id, job.id)).run();
      processed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      db.update(jobQueue).set({ status: "failed", errorMessage: errorMsg }).where(eq(jobQueue.id, job.id)).run();
      logActivity("error", `Error generando email para ${lead?.name}: ${errorMsg}`, { leadId: job.leadId ?? undefined });
    }
  }
  return processed;
}

// --- Process WhatsApp generation jobs ---

async function processWhatsAppGenerationJobs() {
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
      logActivity("wa_failed", `WA no generado para ${lead.name}: en blacklist`, { leadId: lead.id });
      continue;
    }

    if (!lead.phone) {
      db.update(jobQueue).set({ status: "failed", errorMessage: "No phone" }).where(eq(jobQueue.id, job.id)).run();
      continue;
    }

    try {
      const analysis: WebAnalysis = lead.analysisJson ? JSON.parse(lead.analysisJson) : {
        hasWebsite: !!lead.website, qualityScore: lead.webQualityScore || 0,
        issues: [], strengths: [], summary: lead.analysisSummary || "",
        isMobile: false, hasSSL: false, loadSpeed: "unknown" as const,
        designScore: 0, contentScore: 0, functionalityScore: 0, extractedEmails: [],
        seoScore: 50, seoIssues: [], googleBusinessOpportunities: [],
        socialMediaPresence: [], aiAgentOpportunities: [], recommendedServices: ["web_development"],
      };

      const campaign = lead.campaignId
        ? db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).get()
        : null;

      let tone = campaign?.defaultTone || getSetting("default_tone") || "profesional";
      const fromName = getSetting("from_name") || getSetting("agency_name") || "VanguardIA";

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
        undefined, abCustomInstructions, detectCountryFromPhone(lead.phone) || undefined
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
      });

      db.update(jobQueue).set({ status: "completed", processedAt: new Date().toISOString() }).where(eq(jobQueue.id, job.id)).run();
      processed++;
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      db.update(jobQueue).set({ status: "failed", errorMessage: errorMsg }).where(eq(jobQueue.id, job.id)).run();
      logActivity("error", `Error generando WA para ${lead?.name}: ${errorMsg}`, { leadId: job.leadId ?? undefined });
    }
  }
  return processed;
}

// --- Process email sending with warmup and send window ---

function getBounceRate7d(): number {
  const sentLast7 = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "sent"), sql`${emails.sentAt} >= datetime('now', '-7 days')`))
    .get()?.count ?? 0;
  const bouncedLast7 = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "failed"), sql`${emails.sentAt} >= datetime('now', '-7 days')`))
    .get()?.count ?? 0;
  const total = sentLast7 + bouncedLast7;
  return total > 0 ? (bouncedLast7 / total) * 100 : 0;
}

async function processEmailSending() {
  // Check send window
  if (!isWithinSendWindow()) {
    return { sent: 0, reason: "Outside send window" };
  }

  // Auto-pause if bounce rate exceeds 5% over last 7 days
  const bounceRate = getBounceRate7d();
  if (bounceRate >= 5) {
    console.warn(`[cron] Bounce rate ${bounceRate.toFixed(1)}% >= 5% — envíos pausados automáticamente`);
    return { sent: 0, reason: `Bounce rate too high (${bounceRate.toFixed(1)}%)` };
  }

  const effectiveLimit = getEffectiveDailyLimit();
  const today = new Date().toISOString().split("T")[0];

  const sentToday = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "sent"), sql`date(${emails.sentAt}) = ${today}`))
    .get()?.count ?? 0;

  if (sentToday >= effectiveLimit) {
    return { sent: 0, reason: `Daily limit reached (${sentToday}/${effectiveLimit})` };
  }

  // Increment warmup day on first send of the day
  if (sentToday === 0) {
    incrementWarmupDay();
  }

  const remaining = effectiveLimit - sentToday;

  const approvedEmails = db.select({
    email: emails,
    campaignDailyLimit: campaigns.dailyLimit,
  })
    .from(emails)
    .leftJoin(campaigns, eq(emails.campaignId, campaigns.id))
    .where(eq(emails.status, "approved"))
    .limit(remaining)
    .all();

  const campaignSentToday: Record<number, number> = {};

  let sent = 0;
  for (const row of approvedEmails) {
    if (sent >= remaining) break;

    // RGPD: Check if unsubscribed
    if (isUnsubscribed(row.email.toEmail)) {
      db.update(emails).set({ status: "failed" }).where(eq(emails.id, row.email.id)).run();
      logActivity("email_failed", `Email no enviado a ${row.email.toEmail}: se dio de baja`, { leadId: row.email.leadId });
      continue;
    }

    // Check per-campaign limit
    if (row.email.campaignId) {
      if (!(row.email.campaignId in campaignSentToday)) {
        const campSent = db.select({ count: sql<number>`count(*)` }).from(emails)
          .where(and(
            eq(emails.campaignId, row.email.campaignId),
            eq(emails.status, "sent"),
            sql`date(${emails.sentAt}) = ${today}`
          )).get()?.count ?? 0;
        campaignSentToday[row.email.campaignId] = campSent;
      }

      const campLimit = row.campaignDailyLimit ?? effectiveLimit;
      if (campaignSentToday[row.email.campaignId] >= campLimit) {
        continue;
      }
    }

    // Domain rotation: pick domain with fewest sends today
    let fromName = getSetting("from_name") || getSetting("agency_name") || "VanguardIA";
    let fromEmail = row.email.fromEmail || getSetting("from_email") || "hola@vanguardia.dev";
    let sendApiKey: string | undefined;

    const activeDomains = db.select().from(sendingDomains)
      .where(ne(sendingDomains.status, "paused"))
      .all();

    let selectedDomain: typeof activeDomains[0] | null = null;
    let selectedDomainPrevSent = 0;

    if (activeDomains.length > 0) {
      // Pick domain with fewest sends today and under its effective (warmup) limit
      let bestCount = Infinity;

      for (const d of activeDomains) {
        // Initialize warmupDay to 1 if it is 0 or null (new domain added later)
        const domainWarmupDay = d.warmupDay && d.warmupDay > 0 ? d.warmupDay : 1;
        if (!d.warmupDay || d.warmupDay <= 0) {
          db.update(sendingDomains)
            .set({ warmupDay: 1 })
            .where(eq(sendingDomains.id, d.id))
            .run();
          d.warmupDay = 1;
        }

        const domainSent = db.select({ count: sql<number>`count(*)` }).from(emails)
          .where(and(
            eq(emails.fromEmail, d.fromEmail),
            eq(emails.status, "sent"),
            sql`date(${emails.sentAt}) = ${today}`
          )).get()?.count ?? 0;

        // Per-domain warmup: effective limit = min(startLimit + (warmupDay-1)*increment, dailyLimit)
        const domainEffectiveLimit = Math.min(
          d.warmupStartLimit + (domainWarmupDay - 1) * d.warmupIncrement,
          d.dailyLimit
        );

        if (domainSent < domainEffectiveLimit && domainSent < bestCount) {
          bestCount = domainSent;
          selectedDomain = d;
          selectedDomainPrevSent = domainSent;
        }
      }

      if (selectedDomain) {
        fromName = selectedDomain.fromName;
        fromEmail = selectedDomain.fromEmail;
        if (selectedDomain.resendApiKey) sendApiKey = selectedDomain.resendApiKey;
      }
    }

    // Generate unsubscribe URL and inject into email
    const unsubUrl = generateUnsubscribeUrl(row.email.toEmail, row.email.leadId);

    // Inject unsubscribe link, then tracking pixel, then wrap links
    let finalHtml = injectUnsubscribeLink(row.email.bodyHtml, unsubUrl);
    finalHtml = injectTrackingPixel(finalHtml, row.email.id);
    finalHtml = wrapLinksWithTracking(finalHtml, row.email.id);
    const finalText = appendUnsubscribeText(row.email.bodyText, unsubUrl);

    const replyToEmail = getSetting("reply_to_email") || undefined;

    const result = await sendEmail({
      to: row.email.toEmail,
      from: `${fromName} <${fromEmail}>`,
      subject: row.email.subject,
      html: finalHtml,
      text: finalText,
      replyTo: replyToEmail,
      headers: {
        "List-Unsubscribe": `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });

    if (result.success) {
      db.update(emails).set({
        status: "sent",
        resendId: result.id,
        fromEmail,
        sentAt: new Date().toISOString(),
      }).where(eq(emails.id, row.email.id)).run();

      db.update(leads).set({
        status: "email_sent",
        emailSentAt: new Date().toISOString(),
      }).where(eq(leads.id, row.email.leadId)).run();

      if (row.email.campaignId) {
        campaignSentToday[row.email.campaignId] = (campaignSentToday[row.email.campaignId] || 0) + 1;
      }

      // Per-domain warmup: increment warmupDay on first send of the day for this domain
      if (selectedDomain && selectedDomainPrevSent === 0) {
        const domainCurrentLimit = selectedDomain.warmupStartLimit + (selectedDomain.warmupDay - 1) * selectedDomain.warmupIncrement;
        if (domainCurrentLimit < selectedDomain.dailyLimit) {
          db.update(sendingDomains)
            .set({ warmupDay: selectedDomain.warmupDay + 1 })
            .where(eq(sendingDomains.id, selectedDomain.id))
            .run();
        }
      }

      logActivity("email_sent", `Email enviado a ${row.email.toEmail} desde ${fromEmail}`, {
        leadId: row.email.leadId,
        campaignId: row.email.campaignId ?? undefined,
      });

      sent++;

      // Stagger sends: random delay 30-120 seconds between emails
      if (sent < remaining) {
        const delay = 30000 + Math.random() * 90000;
        await new Promise((r) => setTimeout(r, delay));
      }
    } else {
      db.update(emails).set({ status: "failed" }).where(eq(emails.id, row.email.id)).run();
      logActivity("email_failed", `Error enviando email a ${row.email.toEmail}: ${result.error}`, {
        leadId: row.email.leadId,
      });
    }
  }

  return { sent, limit: effectiveLimit, sentToday: sentToday + sent };
}

// --- Autopilot send queue ---

async function processAutopilotSendQueue() {
  const jobs = db.select().from(jobQueue)
    .where(and(eq(jobQueue.type, "send_email"), eq(jobQueue.status, "pending")))
    .limit(10)
    .all();

  for (const job of jobs) {
    if (!job.leadId) continue;
    const email = db.select().from(emails).where(and(eq(emails.leadId, job.leadId), eq(emails.status, "draft"))).get();
    if (email) {
      db.update(emails).set({ status: "approved" }).where(eq(emails.id, email.id)).run();
    }
    db.update(jobQueue).set({ status: "completed", processedAt: new Date().toISOString() }).where(eq(jobQueue.id, job.id)).run();
  }
}

// --- WhatsApp sending ---

async function processWhatsAppSending() {
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
      });

      sent++;
    } else {
      db.update(whatsappMessages).set({
        status: "failed",
        updatedAt: new Date().toISOString(),
      }).where(eq(whatsappMessages.id, msg.id)).run();

      logActivity("wa_failed", `Error enviando WhatsApp a ${msg.toPhone}: ${result.error}`, {
        leadId: msg.leadId,
      });
    }

    // Stagger: wait 30-90 seconds between messages
    const delay = 30000 + Math.random() * 60000;
    await new Promise((r) => setTimeout(r, delay));
  }

  return { sent };
}

// --- Process follow-up sequences ---

async function processSequences() {
  const now = new Date().toISOString();

  // Get enrollments that are due
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
    // Get the current step
    const step = db.select().from(sequenceSteps)
      .where(and(
        eq(sequenceSteps.campaignId, enrollment.campaignId),
        eq(sequenceSteps.stepNumber, enrollment.currentStep),
        eq(sequenceSteps.enabled, true),
      ))
      .get();

    if (!step) {
      // No more steps — mark as completed
      db.update(sequenceEnrollments)
        .set({ status: "completed", completedAt: now })
        .where(eq(sequenceEnrollments.id, enrollment.id))
        .run();
      continue;
    }

    const lead = db.select().from(leads).where(eq(leads.id, enrollment.leadId)).get();
    if (!lead) continue;

    const analysis: WebAnalysis = lead.analysisJson ? JSON.parse(lead.analysisJson) : {
      hasWebsite: !!lead.website, qualityScore: lead.webQualityScore || 0,
      issues: [], strengths: [], summary: lead.analysisSummary || "",
      isMobile: false, hasSSL: false, loadSpeed: "unknown" as const,
      designScore: 0, contentScore: 0, functionalityScore: 0, extractedEmails: [],
      seoScore: 50, seoIssues: [], googleBusinessOpportunities: [],
      socialMediaPresence: [], aiAgentOpportunities: [], recommendedServices: ["web_development"],
    };

    const fromName = getSetting("from_name") || getSetting("agency_name") || "VanguardIA";

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
          step.tone, fromName, step.stepNumber, step.customInstructions || undefined,
          detectCountryFromPhone(lead.phone) || undefined
        );

        const fromEmail = getSetting("from_email") || "hola@vanguardia.dev";
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
          step.tone, fromName, step.stepNumber, step.customInstructions || undefined,
          detectCountryFromPhone(lead.phone) || undefined
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
        // Sequence complete
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
      });
    }
  }

  return processed;
}

// --- WhatsApp reply detection ---

// Track which client instance has the listener to avoid duplicates.
// A simple boolean would break on client reconnection (old client destroyed,
// new client created) because the flag would stay true while the new client
// has no listener. Storing the client reference lets us detect that case.
let waListenerClient: ReturnType<typeof getClient> = null;

function setupWhatsAppReplyListener(): void {
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
      });

      // CRM webhook
      await triggerCrmWebhook(lead, "replied");
    } catch {
      // Silently ignore individual reply processing errors
    }
  });

  // waListenerClient is already set at the top of this function.
}

// --- Main handler ---

export async function POST(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const action = searchParams.get("action") || "all";

  const concurrency = parseInt(getSetting("scrape_concurrency") || "3");
  const delayMs = parseInt(getSetting("scrape_delay_ms") || "2000");

  const results: Record<string, unknown> = {};

  // Setup WhatsApp reply listener if connected
  if (isWhatsAppReady()) {
    setupWhatsAppReplyListener();
  }

  if (action === "all" || action === "scrape") {
    results.scraped = await processScrapeJobs(concurrency, delayMs);
  }

  if (action === "all" || action === "generate") {
    results.emailsGenerated = await processEmailGenerationJobs();
    results.whatsappsGenerated = await processWhatsAppGenerationJobs();
  }

  if (action === "all" || action === "send") {
    await processAutopilotSendQueue();
    results.emailsSent = await processEmailSending();
  }

  if (action === "all" || action === "send_wa") {
    results.whatsappsSent = await processWhatsAppSending();
  }

  if (action === "all" || action === "sequences") {
    results.sequencesProcessed = await processSequences();
  }

  return NextResponse.json({ success: true, ...results });
}
