import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/db";
import { isWhatsAppReady } from "@/lib/whatsapp-client";
import { processScrapeJobs } from "@/lib/cron/scrape-jobs";
import { processEmailGenerationJobs } from "@/lib/cron/email-generation";
import { processWhatsAppGenerationJobs } from "@/lib/cron/wa-generation";
import { processEmailSending, processAutopilotSendQueue } from "@/lib/cron/email-sending";
import { processWhatsAppSending } from "@/lib/cron/wa-sending";
import { processSequences } from "@/lib/cron/sequences";
import { setupWhatsAppReplyListener } from "@/lib/cron/wa-replies";

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
