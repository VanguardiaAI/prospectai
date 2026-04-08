import { NextRequest, NextResponse } from "next/server";
import { validateBody, executePhaseSchema } from "@/lib/validations";
import { handleServiceError } from "@/services/api-handler";
import {
  checkGeminiConfig,
  checkEmailConfig,
  checkScraperConfig,
  type ConfigCheck,
} from "@/mcp/helpers/validators";
import { getSetting } from "@/db";
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
    let result: unknown;

    switch (phase) {
      case "search": {
        if (!keyword) {
          return NextResponse.json(
            { success: false, error: "validation", message: "Keyword is required for search" },
            { status: 400 }
          );
        }
        const job = await searchService.startSearch({ keyword, campaignId });
        result = { job };
        break;
      }

      case "analysis": {
        const concurrency = parseInt(getSetting("scrape_concurrency") || "3");
        const delayMs = parseInt(getSetting("scrape_delay_ms") || "2000");
        const scraped = await processScrapeJobs(concurrency, delayMs);
        result = { scraped };
        break;
      }

      case "generation": {
        const emailsGenerated = await processEmailGenerationJobs();
        const whatsappsGenerated = await processWhatsAppGenerationJobs();
        result = { emailsGenerated, whatsappsGenerated };
        break;
      }

      case "sending": {
        // Fetch drafts for this campaign
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
        messageService.approveEmails(ids);
        await processAutopilotSendQueue();
        const sendResult = await processEmailSending();
        const waSendResult = await processWhatsAppSending();
        result = { approved: ids.length, sendResult, waSendResult };
        break;
      }

      case "engagement": {
        const sequencesProcessed = await processSequences();
        result = { sequencesProcessed };
        break;
      }
    }

    return NextResponse.json({ success: true, result });
  } catch (err) {
    return handleServiceError(err);
  }
}
