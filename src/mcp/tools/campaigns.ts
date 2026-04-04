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

      let query = db.select().from(campaigns).$dynamic();
      if (status) query = query.where(eq(campaigns.status, status)) as typeof query;

      const allCampaigns = query.orderBy(sql`${campaigns.createdAt} DESC`).all();
      const total = allCampaigns.length;
      const sliced = allCampaigns.slice(offset, offset + l);

      const lines: string[] = [`# Campaigns (${total} total, page ${p})\n`];

      for (const c of sliced) {
        const totalLeads = db.select({ count: sql<number>`count(*)` }).from(leads)
          .where(eq(leads.campaignId, c.id)).get()?.count ?? 0;
        const emailsSent = db.select({ count: sql<number>`count(*)` }).from(emails)
          .where(and(eq(emails.campaignId, c.id), eq(emails.status, "sent"))).get()?.count ?? 0;
        const emailsOpened = db.select({ count: sql<number>`count(*)` }).from(emails)
          .where(and(eq(emails.campaignId, c.id), isNotNull(emails.openedAt))).get()?.count ?? 0;
        const emailsClicked = db.select({ count: sql<number>`count(*)` }).from(emails)
          .where(and(eq(emails.campaignId, c.id), isNotNull(emails.clickedAt))).get()?.count ?? 0;
        const replyCount = db.select({ count: sql<number>`count(*)` }).from(replies)
          .where(eq(replies.campaignId, c.id)).get()?.count ?? 0;
        const pendingDrafts = db.select({ count: sql<number>`count(*)` }).from(emails)
          .where(and(eq(emails.campaignId, c.id), eq(emails.status, "draft"))).get()?.count ?? 0;

        lines.push(formatCampaignSummary(c, {
          totalLeads, emailsSent, emailsOpened, emailsClicked, replies: replyCount, pendingDrafts,
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
