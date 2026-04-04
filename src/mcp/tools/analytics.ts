import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db, getSetting } from "@/db";
import { leads, emails, campaigns, whatsappMessages, replies, activityLog, jobQueue } from "@/db/schema";
import { eq, and, sql, desc, isNotNull } from "drizzle-orm";
import { formatActivityEntry } from "../helpers/formatters.js";
import { paginationParams } from "../helpers/pagination.js";

export function registerAnalyticsTools(server: McpServer) {
  server.tool(
    "get_dashboard",
    "Get comprehensive dashboard metrics: total leads, sends today, open/click/reply rates, active campaigns, pending jobs, warmup status.",
    {},
    async () => {
      const today = new Date().toISOString().split("T")[0];

      const totalLeads = db.select({ count: sql<number>`count(*)` }).from(leads).get()?.count ?? 0;
      const activeCampaigns = db.select({ count: sql<number>`count(*)` }).from(campaigns).where(eq(campaigns.status, "active")).get()?.count ?? 0;

      const sentToday = db.select({ count: sql<number>`count(*)` }).from(emails)
        .where(and(eq(emails.status, "sent"), sql`date(${emails.sentAt}) = ${today}`)).get()?.count ?? 0;

      const totalSent = db.select({ count: sql<number>`count(*)` }).from(emails).where(eq(emails.status, "sent")).get()?.count ?? 0;
      const totalOpened = db.select({ count: sql<number>`count(*)` }).from(emails).where(isNotNull(emails.openedAt)).get()?.count ?? 0;
      const totalClicked = db.select({ count: sql<number>`count(*)` }).from(emails).where(isNotNull(emails.clickedAt)).get()?.count ?? 0;
      const totalReplied = db.select({ count: sql<number>`count(*)` }).from(replies).get()?.count ?? 0;

      const pendingDrafts = db.select({ count: sql<number>`count(*)` }).from(emails).where(eq(emails.status, "draft")).get()?.count ?? 0;
      const pendingJobs = db.select({ count: sql<number>`count(*)` }).from(jobQueue).where(eq(jobQueue.status, "pending")).get()?.count ?? 0;

      const waSentToday = db.select({ count: sql<number>`count(*)` }).from(whatsappMessages)
        .where(and(eq(whatsappMessages.status, "sent"), sql`date(${whatsappMessages.sentAt}) = ${today}`)).get()?.count ?? 0;
      const waTotalSent = db.select({ count: sql<number>`count(*)` }).from(whatsappMessages).where(eq(whatsappMessages.status, "sent")).get()?.count ?? 0;
      const waPendingDrafts = db.select({ count: sql<number>`count(*)` }).from(whatsappMessages).where(eq(whatsappMessages.status, "draft")).get()?.count ?? 0;

      const globalDailyLimit = parseInt(getSetting("global_daily_limit") || "50");
      const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
      const clickRate = totalOpened > 0 ? Math.round((totalClicked / totalOpened) * 100) : 0;
      const replyRate = totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0;

      // Status distribution
      const statusCounts = db.select({
        status: leads.status,
        count: sql<number>`count(*)`,
      }).from(leads).groupBy(leads.status).all();

      const statusLine = statusCounts.map(s => `${s.status}: ${s.count}`).join(", ");

      const lines = [
        "# ProspectAI Dashboard\n",
        `## Overview`,
        `  Total leads: ${totalLeads}`,
        `  Active campaigns: ${activeCampaigns}`,
        `  Pending jobs: ${pendingJobs}`,
        `\n## Email`,
        `  Sent today: ${sentToday} / ${globalDailyLimit}`,
        `  Total sent: ${totalSent}`,
        `  Pending drafts: ${pendingDrafts}`,
        `  Open rate: ${openRate}%`,
        `  Click rate: ${clickRate}%`,
        `  Reply rate: ${replyRate}%`,
        `\n## WhatsApp`,
        `  Sent today: ${waSentToday}`,
        `  Total sent: ${waTotalSent}`,
        `  Pending drafts: ${waPendingDrafts}`,
        `\n## Lead Status Distribution`,
        `  ${statusLine || "No leads yet"}`,
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_campaign_performance",
    "Get performance metrics for a specific campaign: lead funnel, send/open/click/reply counts, status distribution.",
    {
      campaignId: z.number().int().describe("Campaign ID"),
    },
    async ({ campaignId }) => {
      const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
      if (!campaign) return { content: [{ type: "text", text: `Campaign ID ${campaignId} not found.` }], isError: true };

      const totalLeads = db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.campaignId, campaignId)).get()?.count ?? 0;

      const statusCounts = db.select({
        status: leads.status, count: sql<number>`count(*)`,
      }).from(leads).where(eq(leads.campaignId, campaignId)).groupBy(leads.status).all();

      const emailsSent = db.select({ count: sql<number>`count(*)` }).from(emails)
        .where(and(eq(emails.campaignId, campaignId), eq(emails.status, "sent"))).get()?.count ?? 0;
      const emailsOpened = db.select({ count: sql<number>`count(*)` }).from(emails)
        .where(and(eq(emails.campaignId, campaignId), isNotNull(emails.openedAt))).get()?.count ?? 0;
      const emailsClicked = db.select({ count: sql<number>`count(*)` }).from(emails)
        .where(and(eq(emails.campaignId, campaignId), isNotNull(emails.clickedAt))).get()?.count ?? 0;
      const replyCount = db.select({ count: sql<number>`count(*)` }).from(replies)
        .where(eq(replies.campaignId, campaignId)).get()?.count ?? 0;
      const pendingDrafts = db.select({ count: sql<number>`count(*)` }).from(emails)
        .where(and(eq(emails.campaignId, campaignId), eq(emails.status, "draft"))).get()?.count ?? 0;

      const openRate = emailsSent > 0 ? Math.round((emailsOpened / emailsSent) * 100) : 0;
      const clickRate = emailsOpened > 0 ? Math.round((emailsClicked / emailsOpened) * 100) : 0;
      const replyRate = emailsSent > 0 ? Math.round((replyCount / emailsSent) * 100) : 0;

      const statusLine = statusCounts.map(s => `${s.status}: ${s.count}`).join(", ");

      const lines = [
        `# Campaign: ${campaign.name} [ID:${campaign.id}]`,
        `Status: ${campaign.status} | Tone: ${campaign.defaultTone} | Threshold: ${campaign.qualityThreshold}`,
        campaign.autopilot ? "Autopilot: ON" : "",
        `\n## Funnel`,
        `  Total leads: ${totalLeads}`,
        `  Emails sent: ${emailsSent}`,
        `  Opened: ${emailsOpened} (${openRate}%)`,
        `  Clicked: ${emailsClicked} (${clickRate}%)`,
        `  Replied: ${replyCount} (${replyRate}%)`,
        `  Pending drafts: ${pendingDrafts}`,
        `\n## Lead Status`,
        `  ${statusLine || "No leads"}`,
      ].filter(Boolean);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_recent_activity",
    "Get recent activity log entries showing what the system has been doing (imports, scrapes, emails, errors, etc.).",
    {
      type: z.string().optional().describe("Filter by activity type (import, scrape, email_sent, error, etc.)"),
      page: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
    async ({ type, page, limit }) => {
      const { page: p, limit: l, offset } = paginationParams(page, limit);

      const conditions = [];
      if (type) conditions.push(eq(activityLog.type, type));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const total = db.select({ count: sql<number>`count(*)` })
        .from(activityLog).where(where).get()?.count ?? 0;

      const entries = db.select().from(activityLog)
        .where(where)
        .orderBy(desc(activityLog.createdAt))
        .limit(l)
        .offset(offset)
        .all();

      const lines = [`# Activity Log (${total} total, page ${p})\n`];
      for (const entry of entries) {
        lines.push(formatActivityEntry(entry));
      }
      if (entries.length === 0) lines.push("No activity found.");
      if (offset + l < total) lines.push(`\n... more. Use page=${p + 1}`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_replies",
    "Get recent replies received across email and WhatsApp channels.",
    {
      channel: z.enum(["email", "whatsapp"]).optional().describe("Filter by channel"),
      campaignId: z.number().int().optional().describe("Filter by campaign"),
      page: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
    async ({ channel, campaignId, page, limit }) => {
      const { page: p, limit: l, offset } = paginationParams(page, limit);

      const conditions = [];
      if (channel) conditions.push(eq(replies.channel, channel));
      if (campaignId) conditions.push(eq(replies.campaignId, campaignId));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const total = db.select({ count: sql<number>`count(*)` })
        .from(replies).where(where).get()?.count ?? 0;

      const entries = db.select({
        id: replies.id,
        leadId: replies.leadId,
        channel: replies.channel,
        fromAddress: replies.fromAddress,
        body: replies.body,
        receivedAt: replies.receivedAt,
      }).from(replies)
        .where(where)
        .orderBy(desc(replies.receivedAt))
        .limit(l)
        .offset(offset)
        .all();

      const lines = [`# Replies (${total} total, page ${p})\n`];
      for (const r of entries) {
        const lead = db.select({ name: leads.name }).from(leads).where(eq(leads.id, r.leadId)).get();
        const preview = r.body ? (r.body.length > 100 ? r.body.slice(0, 100) + "..." : r.body) : "(no body)";
        lines.push(`[${r.receivedAt}] ${lead?.name ?? "Unknown"} (${r.channel}) from ${r.fromAddress}: ${preview}`);
      }
      if (entries.length === 0) lines.push("No replies yet.");
      if (offset + l < total) lines.push(`\n... more. Use page=${p + 1}`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
