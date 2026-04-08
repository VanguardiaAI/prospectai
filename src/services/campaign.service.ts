import { db } from "@/db";
import { campaigns, emails, replies, leads } from "@/db/schema";
import { eq, and, sql, isNotNull, desc } from "drizzle-orm";
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
}

export interface UpdateCampaignInput {
  name?: string;
  description?: string;
  dailyLimit?: number;
  qualityThreshold?: number;
  autopilot?: boolean;
  defaultTone?: string;
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
  let query = db.select().from(campaigns).orderBy(campaigns.createdAt);
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
