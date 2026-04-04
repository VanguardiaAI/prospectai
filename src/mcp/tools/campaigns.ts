import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/db";
import { campaigns, leads, emails, whatsappMessages, replies } from "@/db/schema";
import { eq, sql, and, isNotNull } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { formatCampaignSummary } from "../helpers/formatters.js";
import { paginationParams } from "../helpers/pagination.js";

export function registerCampaignTools(server: McpServer) {
  server.tool(
    "list_campaigns",
    "List all campaigns with summary metrics (leads, emails sent, open rate, replies). Ordered by most recent.",
    {
      status: z.enum(["active", "paused", "archived"]).optional().describe("Filter by status"),
      page: z.number().int().positive().optional().describe("Page number (default 1)"),
      limit: z.number().int().min(1).max(20).optional().describe("Items per page (max 20)"),
    },
    async ({ status, page, limit }) => {
      const { page: p, limit: l, offset } = paginationParams(page, limit);

      const conditions = [];
      if (status) conditions.push(eq(campaigns.status, status));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const total = db.select({ count: sql<number>`count(*)` }).from(campaigns).where(where).get()?.count ?? 0;

      const pageCampaigns = db.select().from(campaigns)
        .where(where)
        .orderBy(sql`${campaigns.createdAt} DESC`)
        .limit(l)
        .offset(offset)
        .all();

      // Batch-fetch metrics for all campaigns on this page in single queries
      const campaignIds = pageCampaigns.map(c => c.id);

      const leadCounts = campaignIds.length > 0
        ? db.select({ campaignId: leads.campaignId, count: sql<number>`count(*)` })
            .from(leads)
            .where(sql`${leads.campaignId} IN (${sql.join(campaignIds.map(id => sql`${id}`), sql`, `)})`)
            .groupBy(leads.campaignId).all()
        : [];

      const emailStats = campaignIds.length > 0
        ? db.select({
            campaignId: emails.campaignId,
            status: emails.status,
            count: sql<number>`count(*)`,
            opened: sql<number>`sum(case when ${emails.openedAt} is not null then 1 else 0 end)`,
            clicked: sql<number>`sum(case when ${emails.clickedAt} is not null then 1 else 0 end)`,
          }).from(emails)
            .where(sql`${emails.campaignId} IN (${sql.join(campaignIds.map(id => sql`${id}`), sql`, `)})`)
            .groupBy(emails.campaignId, emails.status).all()
        : [];

      const replyCounts = campaignIds.length > 0
        ? db.select({ campaignId: replies.campaignId, count: sql<number>`count(*)` })
            .from(replies)
            .where(sql`${replies.campaignId} IN (${sql.join(campaignIds.map(id => sql`${id}`), sql`, `)})`)
            .groupBy(replies.campaignId).all()
        : [];

      // Build lookup maps
      const leadsMap = new Map(leadCounts.map(r => [r.campaignId, r.count]));
      const repliesMap = new Map(replyCounts.map(r => [r.campaignId, r.count]));

      const emailMetrics = new Map<number, { sent: number; opened: number; clicked: number; drafts: number }>();
      for (const row of emailStats) {
        const cid = row.campaignId!;
        if (!emailMetrics.has(cid)) emailMetrics.set(cid, { sent: 0, opened: 0, clicked: 0, drafts: 0 });
        const m = emailMetrics.get(cid)!;
        if (row.status === "sent") {
          m.sent += row.count;
          m.opened += row.opened ?? 0;
          m.clicked += row.clicked ?? 0;
        } else if (row.status === "draft") {
          m.drafts += row.count;
        }
      }

      const lines: string[] = [`# Campaigns (${total} total, page ${p})\n`];

      for (const c of pageCampaigns) {
        const em = emailMetrics.get(c.id) ?? { sent: 0, opened: 0, clicked: 0, drafts: 0 };
        lines.push(formatCampaignSummary(c, {
          totalLeads: leadsMap.get(c.id) ?? 0,
          emailsSent: em.sent,
          emailsOpened: em.opened,
          emailsClicked: em.clicked,
          replies: repliesMap.get(c.id) ?? 0,
          pendingDrafts: em.drafts,
        }));
      }

      if (offset + l < total) lines.push(`\n... ${total - offset - l} more. Use page=${p + 1}`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "create_campaign",
    "Create a new outreach campaign. If a campaign with the same name exists, returns the existing one (idempotent).",
    {
      name: z.string().min(1).describe("Campaign name"),
      description: z.string().optional().describe("Campaign description"),
      dailyLimit: z.number().int().positive().optional().describe("Daily email limit (default 20)"),
      qualityThreshold: z.number().int().min(0).max(100).optional().describe("Max web quality score to contact (default 40)"),
      autopilot: z.boolean().optional().describe("Auto-approve generated messages"),
      defaultTone: z.string().optional().describe("Default tone for messages (profesional, casual, etc.)"),
    },
    async ({ name, description, dailyLimit, qualityThreshold, autopilot, defaultTone }) => {
      // Idempotency: check if campaign with same name exists
      const existing = db.select().from(campaigns)
        .where(eq(campaigns.name, name))
        .get();

      if (existing) {
        return {
          content: [{ type: "text", text: `Campaign already exists: [ID:${existing.id}] "${existing.name}" (${existing.status}). Use update_campaign to modify it.` }],
        };
      }

      const campaign = db.insert(campaigns).values({
        name,
        description: description ?? null,
        dailyLimit: dailyLimit ?? 20,
        qualityThreshold: qualityThreshold ?? 40,
        autopilot: autopilot ?? false,
        defaultTone: defaultTone ?? "profesional",
      }).returning().get();

      logActivity("campaign_change", `Campaign created via MCP: "${name}"`, {
        campaignId: campaign.id,
      });

      return {
        content: [{ type: "text", text: `Campaign created: [ID:${campaign.id}] "${campaign.name}" | Limit: ${campaign.dailyLimit}/day | Threshold: ${campaign.qualityThreshold} | Tone: ${campaign.defaultTone}${campaign.autopilot ? " | AUTOPILOT" : ""}` }],
      };
    }
  );

  server.tool(
    "update_campaign",
    "Update campaign settings or change its status (active/paused/archived).",
    {
      campaignId: z.number().int().describe("Campaign ID"),
      name: z.string().optional(),
      description: z.string().optional(),
      dailyLimit: z.number().int().positive().optional(),
      qualityThreshold: z.number().int().min(0).max(100).optional(),
      autopilot: z.boolean().optional(),
      defaultTone: z.string().optional(),
      status: z.enum(["active", "paused", "archived"]).optional(),
    },
    async ({ campaignId, ...updates }) => {
      const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
      if (!campaign) {
        return { content: [{ type: "text", text: `Campaign ID ${campaignId} not found.` }], isError: true };
      }

      const setValues: Record<string, unknown> = { updatedAt: new Date().toISOString() };
      const changed: string[] = [];

      if (updates.name !== undefined) { setValues.name = updates.name; changed.push("name"); }
      if (updates.description !== undefined) { setValues.description = updates.description; changed.push("description"); }
      if (updates.dailyLimit !== undefined) { setValues.dailyLimit = updates.dailyLimit; changed.push("dailyLimit"); }
      if (updates.qualityThreshold !== undefined) { setValues.qualityThreshold = updates.qualityThreshold; changed.push("qualityThreshold"); }
      if (updates.autopilot !== undefined) { setValues.autopilot = updates.autopilot; changed.push("autopilot"); }
      if (updates.defaultTone !== undefined) { setValues.defaultTone = updates.defaultTone; changed.push("defaultTone"); }
      if (updates.status !== undefined) { setValues.status = updates.status; changed.push("status"); }

      if (changed.length === 0) {
        return { content: [{ type: "text", text: "No changes specified." }] };
      }

      db.update(campaigns).set(setValues).where(eq(campaigns.id, campaignId)).run();

      logActivity("campaign_change", `Campaign "${campaign.name}" updated via MCP: ${changed.join(", ")}`, {
        campaignId,
      });

      return { content: [{ type: "text", text: `Campaign [ID:${campaignId}] "${campaign.name}" updated: ${changed.join(", ")}` }] };
    }
  );
}
