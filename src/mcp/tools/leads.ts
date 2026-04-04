import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/db";
import { leads, emails, whatsappMessages } from "@/db/schema";
import { eq, and, sql, gte, lte, like, desc } from "drizzle-orm";
import { formatLeadSummary, formatLeadDetails } from "../helpers/formatters.js";
import { paginationParams } from "../helpers/pagination.js";
import { importLeadsFromCSV } from "@/lib/csv-importer";

export function registerLeadTools(server: McpServer) {
  server.tool(
    "search_leads",
    "Search and filter leads across campaigns. Returns summarized data (max 20 per page). Use get_lead_details for full information on a single lead.",
    {
      campaignId: z.number().int().optional().describe("Filter by campaign ID"),
      city: z.string().optional().describe("Filter by city name"),
      status: z.string().optional().describe("Filter by status (imported, analyzed, email_generated, etc.)"),
      minScore: z.number().int().min(0).max(100).optional().describe("Minimum opportunity score"),
      maxScore: z.number().int().min(0).max(100).optional().describe("Maximum opportunity score"),
      search: z.string().optional().describe("Search by name or category"),
      page: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
    async ({ campaignId, city, status, minScore, maxScore, search, page, limit }) => {
      const { page: p, limit: l, offset } = paginationParams(page, limit);

      const conditions = [];
      if (campaignId) conditions.push(eq(leads.campaignId, campaignId));
      if (city) conditions.push(sql`lower(${leads.city}) = lower(${city})`);
      if (status) conditions.push(sql`${leads.status} = ${status}`);
      if (minScore !== undefined) conditions.push(gte(leads.opportunityScore, minScore));
      if (maxScore !== undefined) conditions.push(lte(leads.opportunityScore, maxScore));
      if (search) conditions.push(sql`(lower(${leads.name}) LIKE lower(${"%" + search + "%"}) OR lower(${leads.category}) LIKE lower(${"%" + search + "%"}))`);

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const total = db.select({ count: sql<number>`count(*)` })
        .from(leads).where(where).get()?.count ?? 0;

      const results = db.select({
        id: leads.id,
        name: leads.name,
        city: leads.city,
        category: leads.category,
        status: leads.status,
        opportunityScore: leads.opportunityScore,
        webQualityScore: leads.webQualityScore,
        email: leads.email,
        extractedEmail: leads.extractedEmail,
        contactEmail: leads.contactEmail,
        phone: leads.phone,
        website: leads.website,
      }).from(leads)
        .where(where)
        .orderBy(desc(leads.opportunityScore))
        .limit(l)
        .offset(offset)
        .all();

      const lines = [`# Leads (${total} total, page ${p})\n`];
      for (const lead of results) {
        lines.push(formatLeadSummary(lead));
      }

      if (offset + l < total) {
        lines.push(`\n... ${total - offset - l} more. Use page=${p + 1}`);
      }

      if (total === 0) lines.push("No leads found matching your criteria.");

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_lead_details",
    "Get complete details for a single lead including web analysis, recommended services, issues, and message history.",
    {
      leadId: z.number().int().describe("Lead ID"),
    },
    async ({ leadId }) => {
      const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
      if (!lead) {
        return { content: [{ type: "text", text: `Lead ID ${leadId} not found.` }], isError: true };
      }

      const leadEmails = db.select({
        id: emails.id,
        subject: emails.subject,
        status: emails.status,
        tone: emails.tone,
      }).from(emails).where(eq(emails.leadId, leadId)).all();

      const leadWA = db.select({
        id: whatsappMessages.id,
        status: whatsappMessages.status,
        tone: whatsappMessages.tone,
      }).from(whatsappMessages).where(eq(whatsappMessages.leadId, leadId)).all();

      let text = formatLeadDetails(lead);

      if (leadEmails.length > 0) {
        text += `\n\n## Emails (${leadEmails.length})`;
        for (const e of leadEmails) {
          text += `\n  [ID:${e.id}] "${e.subject}" | ${e.status} | ${e.tone}`;
        }
      }

      if (leadWA.length > 0) {
        text += `\n\n## WhatsApp Messages (${leadWA.length})`;
        for (const w of leadWA) {
          text += `\n  [ID:${w.id}] ${w.status} | ${w.tone}`;
        }
      }

      return { content: [{ type: "text", text }] };
    }
  );

  server.tool(
    "import_leads_csv",
    "Import leads from CSV text data. Supports Outscraper format with automatic column mapping. Handles deduplication and blacklist filtering. Leads with websites are automatically queued for scraping and analysis.",
    {
      csvData: z.string().min(1).describe("CSV text content with headers"),
      campaignId: z.number().int().optional().describe("Assign leads to this campaign"),
    },
    async ({ csvData, campaignId }) => {
      try {
        const result = importLeadsFromCSV(csvData, campaignId);
        const lines = [
          "# Import Results\n",
          `Total rows: ${result.total}`,
          `Imported: ${result.imported}`,
          `Duplicates: ${result.duplicates}`,
          `Blacklisted: ${result.blacklisted}`,
          `Skipped (no name): ${result.skipped}`,
        ];
        if (result.imported > 0) {
          lines.push(`\nLeads with websites have been queued for scraping and analysis.`);
          lines.push(`Use process_jobs to start processing, or wait for the background scheduler.`);
        }
        return { content: [{ type: "text", text: lines.join("\n") }] };
      } catch (e) {
        return {
          content: [{ type: "text", text: `Import error: ${e instanceof Error ? e.message : "unknown"}` }],
          isError: true,
        };
      }
    }
  );
}
