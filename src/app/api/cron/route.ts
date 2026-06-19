import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/db";
import { getSession } from "@/lib/auth";
import { isWhatsAppReady } from "@/lib/whatsapp-client";
import { processScrapeJobs } from "@/lib/cron/scrape-jobs";
import { processEmailGenerationJobs } from "@/lib/cron/email-generation";
import { processWhatsAppGenerationJobs } from "@/lib/cron/wa-generation";
import { processEmailSending, processAutopilotSendQueue } from "@/lib/cron/email-sending";
import { processWhatsAppSending } from "@/lib/cron/wa-sending";
import { processChannelFallback } from "@/lib/cron/channel-fallback";
import { processSequences } from "@/lib/cron/sequences";
import { setupWhatsAppReplyListener } from "@/lib/cron/wa-replies";
import { processEmailReplies } from "@/lib/cron/email-replies";
import { processWorkanaScans } from "@/lib/cron/workana-scan";
import { processWorkanaSending } from "@/lib/cron/workana-sending";
import { processWorkanaReplies } from "@/lib/cron/workana-replies";

export async function POST(req: NextRequest) {
  // Accept either the cron secret (scheduler / external cron) OR a logged-in
  // dashboard session (manual "run now" triggers from Settings). Both are gated
  // again by the proxy; this is defense-in-depth.
  const secret = req.headers.get("x-cron-secret") || req.headers.get("authorization")?.replace("Bearer ", "");
  const secretOk = !!secret && secret === process.env.CRON_SECRET;
  if (!secretOk && !(await getSession())) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

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

  // Release parked WhatsApp fallbacks (email got no reply) before WA sending, so
  // a released message can go out in the same tick.
  if (action === "all" || action === "fallback") {
    results.channelFallback = await processChannelFallback();
  }

  if (action === "all" || action === "send_wa") {
    results.whatsappsSent = await processWhatsAppSending();
  }

  if (action === "all" || action === "sequences") {
    results.sequencesProcessed = await processSequences();
  }

  if (action === "all" || action === "replies") {
    results.emailReplies = await processEmailReplies();
  }

  if (action === "all" || action === "workana_scan") {
    if (getSetting("workana_enabled") === "true") {
      results.workanaScan = await processWorkanaScans();
    }
  }

  // Auto-spaced Workana sender: drips ≤1 approved proposal per tick, ≥20 min apart,
  // best-first, up to the weekly budget. Self-gates on enabled/allow_submit/autosend.
  if (action === "all" || action === "workana_send") {
    if (getSetting("workana_enabled") === "true") {
      results.workanaSend = await processWorkanaSending();
    }
  }

  if (action === "all" || action === "workana_replies") {
    if (getSetting("workana_enabled") === "true") {
      results.workanaReplies = await processWorkanaReplies();
    }
  }

  return NextResponse.json({ success: true, ...results });
}
