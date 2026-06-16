import { db } from "@/db";
import { campaigns, emails, replies, leads, whatsappMessages, jobQueue } from "@/db/schema";
import { eq, and, sql, isNotNull, inArray } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { NotFoundError } from "./errors";

// ─── Types ──────────────────────────────────────────────────────────

export interface CampaignMetrics {
  sent: number;
  opened: number;
  openRate: number;
  replies: number;
}

export interface CreateCampaignInput {
  name: string;
  description?: string;
  dailyLimit?: number;
  qualityThreshold?: number;
  autopilot?: boolean;
  defaultTone?: string;
  strategy?: "web_design" | "seo_visibility";
}

export interface UpdateCampaignInput {
  name?: string;
  description?: string;
  dailyLimit?: number;
  qualityThreshold?: number;
  autopilot?: boolean;
  defaultTone?: string;
  strategy?: "web_design" | "seo_visibility";
  status?: "active" | "paused" | "archived";
}

// ─── Helpers ────────────────────────────────────────────────────────

function getCampaignMetrics(campaignIds: number[]): Record<number, CampaignMetrics> {
  if (campaignIds.length === 0) return {};

  const sentCounts = db.select({
    campaignId: emails.campaignId,
    count: sql<number>`count(*)`,
  }).from(emails)
    .where(eq(emails.status, "sent"))
    .groupBy(emails.campaignId)
    .all();

  const openedCounts = db.select({
    campaignId: emails.campaignId,
    count: sql<number>`count(*)`,
  }).from(emails)
    .where(and(eq(emails.status, "sent"), isNotNull(emails.openedAt)))
    .groupBy(emails.campaignId)
    .all();

  const replyCounts = db.select({
    campaignId: replies.campaignId,
    count: sql<number>`count(*)`,
  }).from(replies)
    .groupBy(replies.campaignId)
    .all();

  const sentMap = Object.fromEntries(sentCounts.map((r) => [r.campaignId, r.count]));
  const openedMap = Object.fromEntries(openedCounts.map((r) => [r.campaignId, r.count]));
  const replyMap = Object.fromEntries(replyCounts.map((r) => [r.campaignId, r.count]));

  const result: Record<number, CampaignMetrics> = {};
  for (const id of campaignIds) {
    const sent = sentMap[id] ?? 0;
    const opened = openedMap[id] ?? 0;
    const repliesCount = replyMap[id] ?? 0;
    const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
    result[id] = { sent, opened, openRate, replies: repliesCount };
  }
  return result;
}

// ─── Service Functions ──────────────────────────────────────────────

export function listCampaigns(opts?: { status?: string }) {
  const query = db.select().from(campaigns).orderBy(campaigns.createdAt);
  const all = opts?.status
    ? query.where(eq(campaigns.status, opts.status as "active" | "paused" | "archived")).all()
    : query.all();

  const metricsMap = getCampaignMetrics(all.map((c) => c.id));
  return all.map((c) => ({ ...c, metrics: metricsMap[c.id] ?? { sent: 0, opened: 0, openRate: 0, replies: 0 } }));
}

export function getCampaign(id: number) {
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, id)).get();
  if (!campaign) throw new NotFoundError("Campaign", id);

  const metricsMap = getCampaignMetrics([id]);
  const leadCount = db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.campaignId, id)).get()?.count ?? 0;

  return { ...campaign, metrics: metricsMap[id] ?? { sent: 0, opened: 0, openRate: 0, replies: 0 }, leadCount };
}

export function createCampaign(input: CreateCampaignInput, opts?: { idempotent?: boolean; source?: string }) {
  if (opts?.idempotent) {
    const existing = db.select().from(campaigns).where(eq(campaigns.name, input.name)).get();
    if (existing) return { campaign: existing, created: false };
  }

  const campaign = db.insert(campaigns).values({
    name: input.name,
    description: input.description || null,
    dailyLimit: input.dailyLimit ?? 20,
    qualityThreshold: input.qualityThreshold ?? 40,
    autopilot: input.autopilot ?? false,
    defaultTone: input.defaultTone || "professional",
    strategy: input.strategy || "web_design",
  }).returning().get();

  logActivity("campaign_change", `Campaña "${campaign.name}" creada`, {
    campaignId: campaign.id,
    messageKey: "activityLog.campaignCreated",
    messageVars: { name: campaign.name },
  });

  return { campaign, created: true };
}

export function updateCampaign(id: number, updates: UpdateCampaignInput) {
  const result = db.update(campaigns).set(updates).where(eq(campaigns.id, id)).returning().get();
  if (!result) throw new NotFoundError("Campaign", id);

  logActivity("campaign_change", `Campaña "${result.name}" actualizada`, {
    campaignId: result.id,
    messageKey: "activityLog.campaignUpdated",
    messageVars: { name: result.name },
  });

  return result;
}

export function deleteCampaign(id: number) {
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, id)).get();
  if (!campaign) throw new NotFoundError("Campaign", id);

  db.delete(campaigns).where(eq(campaigns.id, id)).run();

  logActivity("campaign_change", `Campaña "${campaign.name}" eliminada`, {
    messageKey: "activityLog.campaignDeleted",
    messageVars: { name: campaign.name },
  });

  return { success: true };
}

export function getCampaignPerformance(campaignId: number) {
  const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
  if (!campaign) throw new NotFoundError("Campaign", campaignId);

  const metricsMap = getCampaignMetrics([campaignId]);
  const leadCount = db.select({ count: sql<number>`count(*)` }).from(leads).where(eq(leads.campaignId, campaignId)).get()?.count ?? 0;

  const statusBreakdown = db.select({
    status: leads.status,
    count: sql<number>`count(*)`,
  }).from(leads)
    .where(eq(leads.campaignId, campaignId))
    .groupBy(leads.status)
    .all();

  return {
    campaign,
    metrics: metricsMap[campaignId] ?? { sent: 0, opened: 0, openRate: 0, replies: 0 },
    leadCount,
    statusBreakdown,
  };
}

// ─── Campaign Phases ────────────────────────────────────────────────

export type CampaignPhase = "search" | "analysis" | "generation" | "review" | "sending" | "engagement";

const ANALYSIS_STATUSES = ["imported", "queued", "scraping", "scraped", "analyzing"];
const ANALYZED_STATUSES = ["analyzed"];
const DRAFT_STATUSES = ["email_generated", "wa_generated"];
const SENT_STATUSES = ["email_sent", "wa_sent", "contacted"];
const REPLY_STATUSES = ["replied"];

function detectPhase(
  leadCount: number,
  statusMap: Record<string, number>,
  pendingEmailDrafts: number,
  pendingWaDrafts: number,
): CampaignPhase {
  if (leadCount === 0) return "search";

  const inAnalysis = ANALYSIS_STATUSES.reduce((s, k) => s + (statusMap[k] ?? 0), 0);
  const analyzed = ANALYZED_STATUSES.reduce((s, k) => s + (statusMap[k] ?? 0), 0);
  const hasDrafts = pendingEmailDrafts > 0 || pendingWaDrafts > 0;
  const sent = SENT_STATUSES.reduce((s, k) => s + (statusMap[k] ?? 0), 0);
  const replied = REPLY_STATUSES.reduce((s, k) => s + (statusMap[k] ?? 0), 0);

  // Work backwards from engagement
  if (replied > 0 && sent > 0) return "engagement";
  if (sent > 0) return "engagement";
  if (hasDrafts) return "review";
  if (analyzed > 0) return "generation";
  if (inAnalysis > 0) return "analysis";

  return "search";
}

function phaseIndex(phase: CampaignPhase): number {
  const order: CampaignPhase[] = ["search", "analysis", "generation", "review", "sending", "engagement"];
  return order.indexOf(phase);
}

export function getCampaignsWithPhases() {
  const activeCampaigns = db
    .select()
    .from(campaigns)
    .where(inArray(campaigns.status, ["active", "paused"]))
    .all();

  if (activeCampaigns.length === 0) return [];

  return activeCampaigns.map((campaign) => {
    const leadCount =
      db.select({ count: sql<number>`count(*)` })
        .from(leads)
        .where(eq(leads.campaignId, campaign.id))
        .get()?.count ?? 0;

    const statusBreakdown = db
      .select({ status: leads.status, count: sql<number>`count(*)` })
      .from(leads)
      .where(eq(leads.campaignId, campaign.id))
      .groupBy(leads.status)
      .all();

    const statusMap: Record<string, number> = {};
    for (const row of statusBreakdown) {
      statusMap[row.status] = row.count;
    }

    const pendingEmailDrafts =
      db.select({ count: sql<number>`count(*)` })
        .from(emails)
        .where(and(eq(emails.campaignId, campaign.id), eq(emails.status, "draft")))
        .get()?.count ?? 0;

    const pendingWaDrafts =
      db.select({ count: sql<number>`count(*)` })
        .from(whatsappMessages)
        .where(and(eq(whatsappMessages.campaignId, campaign.id), eq(whatsappMessages.status, "draft")))
        .get()?.count ?? 0;

    const approvedEmails =
      db.select({ count: sql<number>`count(*)` })
        .from(emails)
        .where(and(eq(emails.campaignId, campaign.id), eq(emails.status, "approved")))
        .get()?.count ?? 0;

    const approvedWa =
      db.select({ count: sql<number>`count(*)` })
        .from(whatsappMessages)
        .where(and(eq(whatsappMessages.campaignId, campaign.id), eq(whatsappMessages.status, "approved")))
        .get()?.count ?? 0;

    const sentEmails =
      db.select({ count: sql<number>`count(*)` })
        .from(emails)
        .where(and(eq(emails.campaignId, campaign.id), eq(emails.status, "sent")))
        .get()?.count ?? 0;

    // Count pending + processing scrape jobs for this campaign (matches execute route's total source)
    const pendingScrapeJobs =
      db.select({ count: sql<number>`count(*)` })
        .from(jobQueue)
        .where(and(
          eq(jobQueue.campaignId, campaign.id),
          eq(jobQueue.type, "scrape"),
          sql`${jobQueue.status} IN ('pending', 'processing')`
        ))
        .get()?.count ?? 0;

    // Leads actively being processed (scraping/analyzing) also count as "pending"
    const leadsInPipeline = (statusMap["scraping"] ?? 0) + (statusMap["analyzing"] ?? 0);

    const currentPhase = detectPhase(leadCount, statusMap, pendingEmailDrafts, pendingWaDrafts);
    const currentIndex = phaseIndex(currentPhase);

    const metricsMap = getCampaignMetrics([campaign.id]);

    return {
      id: campaign.id,
      name: campaign.name,
      status: campaign.status,
      leadCount,
      currentPhase,
      currentPhaseIndex: currentIndex,
      phases: {
        search: { done: leadCount > 0, count: leadCount },
        analysis: {
          done: (statusMap["analyzed"] ?? 0) > 0 || currentIndex > 1,
          pending: pendingScrapeJobs + leadsInPipeline,
          analyzed: statusMap["analyzed"] ?? 0,
        },
        generation: {
          done: pendingEmailDrafts > 0 || pendingWaDrafts > 0 || sentEmails > 0 || currentIndex > 2,
          emailDrafts: pendingEmailDrafts,
          waDrafts: pendingWaDrafts,
        },
        review: {
          done: approvedEmails > 0 || approvedWa > 0 || sentEmails > 0 || currentIndex > 3,
          pendingEmail: pendingEmailDrafts,
          pendingWa: pendingWaDrafts,
        },
        sending: {
          done: sentEmails > 0 || currentIndex > 4,
          approved: approvedEmails + approvedWa,
          sent: sentEmails,
        },
        engagement: {
          done: (metricsMap[campaign.id]?.replies ?? 0) > 0,
          replied: metricsMap[campaign.id]?.replies ?? 0,
          sent: sentEmails,
        },
      },
      metrics: metricsMap[campaign.id] ?? { sent: 0, opened: 0, openRate: 0, replies: 0 },
    };
  });
}
