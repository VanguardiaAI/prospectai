import { NextRequest, NextResponse } from "next/server";
import { validateBody, executePhaseSchema } from "@/lib/validations";
import { handleServiceError } from "@/services/api-handler";
import {
  checkGeminiConfig,
  checkEmailConfig,
  checkScraperConfig,
  type ConfigCheck,
} from "@/mcp/helpers/validators";
import { db, getSetting } from "@/db";
import { jobQueue, leads, emails, whatsappMessages, sequenceEnrollments } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";
import * as searchService from "@/services/search.service";
import * as messageService from "@/services/message.service";
import { processScrapeJobs } from "@/lib/cron/scrape-jobs";
import { processEmailGenerationJobs } from "@/lib/cron/email-generation";
import { processWhatsAppGenerationJobs } from "@/lib/cron/wa-generation";
import {
  processEmailSending,
  processAutopilotSendQueue,
} from "@/lib/cron/email-sending";
import { processWhatsAppSending } from "@/lib/cron/wa-sending";
import { processSequences } from "@/lib/cron/sequences";
import { logger } from "@/lib/logger";

// ─── Types ──────────────────────────────────────────────────────────

interface ConfigItem {
  key: string;
  type: "env" | "setting";
  settingsSection?: string;
}

// ─── Helpers ────────────────────────────────────────────────────────

const SETTING_SECTIONS: Record<string, string> = {
  from_email: "email",
  from_name: "email",
  unsubscribe_url: "compliance",
  gmaps_scraper_url: "scraper",
};

function toConfigItems(checks: ConfigCheck[]): ConfigItem[] {
  const items: ConfigItem[] = [];
  for (const check of checks) {
    for (const m of check.missing) {
      if (m.includes("env var")) {
        items.push({ key: m.replace(" env var", ""), type: "env" });
      } else if (m.includes("setting")) {
        const key = m.replace(" setting", "");
        items.push({
          key,
          type: "setting",
          settingsSection: SETTING_SECTIONS[key] || "general",
        });
      }
    }
  }
  return items;
}

function collectWarnings(checks: ConfigCheck[]): string[] {
  return checks.flatMap((c) => c.warnings);
}

const PHASE_VALIDATORS: Record<string, () => ConfigCheck[]> = {
  search: () => [checkScraperConfig()],
  analysis: () => [checkGeminiConfig(), checkScraperConfig()],
  generation: () => [checkGeminiConfig()],
  sending: () => [checkEmailConfig()],
  engagement: () => [checkGeminiConfig(), checkEmailConfig()],
};

// Fire-and-forget helper: runs async work in background, logs errors
function fireAndForget(label: string, fn: () => Promise<unknown>) {
  fn().catch((err) => logger.error({ err }, `Background ${label} failed`));
}

// ─── Route ──────────────────────────────────────────────────────────

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: idStr } = await params;
  const campaignId = parseInt(idStr, 10);
  if (isNaN(campaignId)) {
    return NextResponse.json({ error: "Invalid campaign ID" }, { status: 400 });
  }

  const body = await req.json();
  const v = validateBody(executePhaseSchema, body);
  if (!v.success) return v.response;

  const { phase, keyword } = v.data;

  // Validate configuration
  const validators = PHASE_VALIDATORS[phase];
  if (validators) {
    const checks = validators();
    const missing = toConfigItems(checks);
    if (missing.length > 0) {
      return NextResponse.json({
        success: false,
        error: "missing_config",
        missing,
        warnings: collectWarnings(checks),
      });
    }
  }

  try {
    switch (phase) {
      case "search": {
        if (!keyword) {
          return NextResponse.json(
            { success: false, error: "validation", message: "Keyword is required for search" },
            { status: 400 }
          );
        }
        const job = await searchService.startSearch({ keyword, campaignId });
        return NextResponse.json({ success: true, started: true, total: 0, result: { job } });
      }

      case "analysis": {
        // Count pending scrape jobs (global, not per-campaign since processor works globally)
        const pending = db.select({ count: sql<number>`count(*)` })
          .from(jobQueue)
          .where(and(eq(jobQueue.type, "scrape"), eq(jobQueue.status, "pending")))
          .get()?.count ?? 0;

        if (pending === 0) {
          // Count leads still in analysis pipeline for this campaign
          const inPipeline = db.select({ count: sql<number>`count(*)` })
            .from(leads)
            .where(and(
              eq(leads.campaignId, campaignId),
              sql`${leads.status} IN ('imported', 'queued', 'scraping', 'scraped', 'analyzing')`
            ))
            .get()?.count ?? 0;
          if (inPipeline === 0) {
            return NextResponse.json({ success: true, started: true, total: 0 });
          }
        }

        const concurrency = parseInt(getSetting("scrape_concurrency") || "3");
        const delayMs = parseInt(getSetting("scrape_delay_ms") || "2000");
        fireAndForget("analysis", () => processScrapeJobs(concurrency, delayMs));
        return NextResponse.json({ success: true, started: true, total: pending });
      }

      case "generation": {
        // Count analyzed leads ready for generation (with pending generate jobs)
        const pendingEmail = db.select({ count: sql<number>`count(*)` })
          .from(jobQueue)
          .where(and(eq(jobQueue.type, "generate_email"), eq(jobQueue.status, "pending")))
          .get()?.count ?? 0;
        const pendingWa = db.select({ count: sql<number>`count(*)` })
          .from(jobQueue)
          .where(and(eq(jobQueue.type, "generate_wa"), eq(jobQueue.status, "pending")))
          .get()?.count ?? 0;
        const total = pendingEmail + pendingWa;

        fireAndForget("generation", async () => {
          await processEmailGenerationJobs();
          await processWhatsAppGenerationJobs();
        });
        return NextResponse.json({ success: true, started: true, total });
      }

      case "sending": {
        // Fetch and approve drafts for this campaign
        const { emails: draftRows } = messageService.listEmails({
          status: "draft",
          campaignId,
          limit: 1000,
        });
        if (draftRows.length === 0) {
          return NextResponse.json({
            success: false,
            error: "no_drafts",
            message: "No draft messages to approve for this campaign",
          });
        }
        const ids = draftRows.map((r: { email: { id: number } }) => r.email.id);
        // Approve synchronously (fast, DB-only), then fire send in background
        messageService.approveEmails(ids);

        fireAndForget("sending", async () => {
          await processAutopilotSendQueue();
          await processEmailSending();
          await processWhatsAppSending();
        });
        return NextResponse.json({ success: true, started: true, total: ids.length });
      }

      case "engagement": {
        const activeEnrollments = db.select({ count: sql<number>`count(*)` })
          .from(sequenceEnrollments)
          .where(and(
            eq(sequenceEnrollments.status, "active"),
            sql`${sequenceEnrollments.nextActionAt} <= datetime('now')`
          ))
          .get()?.count ?? 0;

        fireAndForget("engagement", () => processSequences());
        return NextResponse.json({ success: true, started: true, total: activeEnrollments });
      }

      default:
        return NextResponse.json({ error: "Invalid phase" }, { status: 400 });
    }
  } catch (err) {
    return handleServiceError(err);
  }
}
