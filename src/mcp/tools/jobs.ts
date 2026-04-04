import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db, getSetting } from "@/db";
import { jobQueue } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { processScrapeJobs } from "@/lib/cron/scrape-jobs";
import { processEmailGenerationJobs } from "@/lib/cron/email-generation";
import { processWhatsAppGenerationJobs } from "@/lib/cron/wa-generation";
import { processSequences } from "@/lib/cron/sequences";

export function registerJobTools(server: McpServer) {
  server.tool(
    "get_job_status",
    "Check status of jobs in the processing queue. Shows pending scrape, generation, and send jobs with aggregate counts.",
    {
      status: z.enum(["pending", "processing", "completed", "failed"]).optional().describe("Filter by job status"),
      type: z.enum(["scrape", "analyze", "generate_email", "send_email", "generate_wa", "send_wa"]).optional().describe("Filter by job type"),
      limit: z.number().int().min(1).max(20).optional().describe("Max jobs to list (default 10)"),
    },
    async ({ status, type, limit = 10 }) => {
      // Aggregate counts
      const counts = db.select({
        status: jobQueue.status,
        type: jobQueue.type,
        count: sql<number>`count(*)`,
      }).from(jobQueue)
        .groupBy(jobQueue.status, jobQueue.type)
        .all();

      const lines = ["# Job Queue Status\n", "## Totals"];
      const byStatus: Record<string, number> = {};
      for (const c of counts) {
        byStatus[c.status] = (byStatus[c.status] || 0) + c.count;
      }
      for (const [s, count] of Object.entries(byStatus)) {
        lines.push(`  ${s}: ${count}`);
      }

      lines.push("\n## By Type");
      const byType: Record<string, Record<string, number>> = {};
      for (const c of counts) {
        if (!byType[c.type]) byType[c.type] = {};
        byType[c.type][c.status] = c.count;
      }
      for (const [t, statuses] of Object.entries(byType)) {
        const parts = Object.entries(statuses).map(([s, n]) => `${s}:${n}`).join(", ");
        lines.push(`  ${t}: ${parts}`);
      }

      // List recent jobs matching filters
      const conditions = [];
      if (status) conditions.push(eq(jobQueue.status, status));
      if (type) conditions.push(eq(jobQueue.type, type));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const jobs = db.select().from(jobQueue)
        .where(where)
        .orderBy(desc(jobQueue.createdAt))
        .limit(Math.min(limit, 20))
        .all();

      if (jobs.length > 0) {
        lines.push(`\n## Recent Jobs (${jobs.length})`);
        for (const j of jobs) {
          lines.push(`  [ID:${j.id}] ${j.type} | ${j.status} | Lead:${j.leadId ?? "N/A"} | Attempts:${j.attempts}/${j.maxAttempts}${j.errorMessage ? ` | Error: ${j.errorMessage.slice(0, 60)}` : ""}`);
        }
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "process_jobs",
    "Trigger job processing for scraping, email/WhatsApp generation, and sequences. Does NOT trigger sending — that is managed by the background scheduler to respect warmup limits.",
    {
      types: z.array(z.enum(["scrape", "generate_email", "generate_wa", "sequences"])).optional()
        .describe("Job types to process (default: all non-send types)"),
    },
    async ({ types }) => {
      const toProcess = types ?? ["scrape", "generate_email", "generate_wa", "sequences"];
      const results: Record<string, number | string> = {};

      if (toProcess.includes("scrape")) {
        const concurrency = parseInt(getSetting("scrape_concurrency") || "3");
        const delayMs = parseInt(getSetting("scrape_delay_ms") || "2000");
        results.scraped = await processScrapeJobs(concurrency, delayMs);
      }

      if (toProcess.includes("generate_email")) {
        results.emailsGenerated = await processEmailGenerationJobs();
      }

      if (toProcess.includes("generate_wa")) {
        results.waGenerated = await processWhatsAppGenerationJobs();
      }

      if (toProcess.includes("sequences")) {
        results.sequencesProcessed = await processSequences();
      }

      const lines = ["# Job Processing Results\n"];
      for (const [key, val] of Object.entries(results)) {
        lines.push(`${key}: ${val}`);
      }

      // Check remaining pending
      const pending = db.select({ count: sql<number>`count(*)` })
        .from(jobQueue).where(eq(jobQueue.status, "pending")).get()?.count ?? 0;
      lines.push(`\nRemaining pending jobs: ${pending}`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
