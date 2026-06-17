import { db, getSetting } from "@/db";
import {
  leads,
  emails,
  campaigns,
  jobQueue,
  replies,
  whatsappMessages,
  activityLog,
  sequenceEnrollments,
} from "@/db/schema";
import { eq, and, sql, desc, isNotNull, type Column } from "drizzle-orm";

// ─── Types ──────────────────────────────────────────────────────────

export interface DashboardMetrics {
  totalLeads: number;
  analyzed: number;
  sentToday: number;
  globalDailyLimit: number;
  autopilotGlobal: boolean;
  pendingReview: number;
  totalSent: number;
  activeCampaigns: number;
  pendingJobs: number;
  statusCounts: { status: string; count: number }[];
  emailsByDay: { date: string; count: number }[];
  qualityDist: { range: string; count: number }[];
  topCities: { city: string | null; count: number }[];
  // Tracking
  totalOpened: number;
  totalClicked: number;
  totalReplied: number;
  openRate: number;
  clickRate: number;
  replyRate: number;
  // Bounces
  totalBounced: number;
  bouncedToday: number;
  bounceRate7d: number;
  // Services
  serviceStats: Record<string, { recommended: number; contacted: number }>;
  // WhatsApp
  waSentToday: number;
  waTotalSent: number;
  waPendingReview: number;
  waDailyLimit: number;
  waReplies: number;
  waReplyRate: number;
  waSentByDay: { date: string; count: number }[];
}

export interface TodayMetrics {
  pendingEmails: unknown[];
  pendingWa: unknown[];
  readyToSend: number;
  readyToSendWa: number;
  activeSequences: number;
  sentToday: number;
  waSentToday: number;
  effectiveLimit: number;
  pendingJobs: number;
}

export interface RecentActivityOpts {
  type?: string;
  limit?: number;
  page?: number;
}

// A draft/approved/sent message row enriched with its lead + campaign, for the
// dashboard "sample" columns (we show a few real rows, not just a count).
export interface LeadSampleRow {
  channel: "email" | "whatsapp";
  id: number;
  leadId: number | null;
  leadName: string | null;
  leadCity: string | null;
  campaignName: string | null;
  preview: string | null;
  createdAt: string | null;
  sentAt: string | null;
}

export interface ReplySampleRow {
  id: number;
  leadId: number | null;
  leadName: string | null;
  channel: string;
  fromAddress: string | null;
  body: string;
  status: string;
  intent: string | null;
  receivedAt: string | null;
}

export interface DashboardSamples {
  pending: LeadSampleRow[];
  approved: LeadSampleRow[];
  sentToday: LeadSampleRow[];
  recentReplies: ReplySampleRow[];
  counts: { pending: number; approved: number; sentToday: number; repliesRecent: number; repliesUnread: number; failed: number };
}

// ─── Service Functions ──────────────────────────────────────────────

export function getDashboardMetrics(campaignId?: number | null): DashboardMetrics {
  const today = new Date().toISOString().split("T")[0];
  const camp = campaignId ?? null;
  // Campaign filter: when a campaign is selected, scope every aggregate to it.
  const cc = (col: Column) => (camp != null ? eq(col, camp) : undefined);

  // Total leads
  const totalLeads = db.select({ count: sql<number>`count(*)` }).from(leads)
    .where(cc(leads.campaignId)).get()?.count ?? 0;

  // Leads by status
  const statusCounts = db.select({
    status: leads.status,
    count: sql<number>`count(*)`,
  }).from(leads).where(cc(leads.campaignId)).groupBy(leads.status).all();

  // Analyzed count
  const analyzed = statusCounts
    .filter(s => ["analyzed", "email_generated", "email_approved", "email_sent", "rejected"].includes(s.status))
    .reduce((sum, s) => sum + s.count, 0);

  // Emails sent today
  const sentToday = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "sent"), sql`date(${emails.sentAt}) = ${today}`, cc(emails.campaignId)))
    .get()?.count ?? 0;

  const globalDailyLimit = parseInt(getSetting("global_daily_limit") || "50");
  const autopilotGlobal = getSetting("autopilot_global") === "true";

  // Pending review
  const pendingReview = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "draft"), cc(emails.campaignId)))
    .get()?.count ?? 0;

  // Total sent
  const totalSent = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "sent"), cc(emails.campaignId)))
    .get()?.count ?? 0;

  // Active campaigns (when scoped, it's 1 if the selected campaign is active)
  const activeCampaigns = db.select({ count: sql<number>`count(*)` }).from(campaigns)
    .where(camp != null
      ? and(eq(campaigns.id, camp), eq(campaigns.status, "active"))
      : eq(campaigns.status, "active"))
    .get()?.count ?? 0;

  // Pending jobs
  const pendingJobs = db.select({ count: sql<number>`count(*)` }).from(jobQueue)
    .where(and(eq(jobQueue.status, "pending"), cc(jobQueue.campaignId)))
    .get()?.count ?? 0;

  // Emails sent per day (last 7 days)
  const emailsByDay = db.select({
    date: sql<string>`date(${emails.sentAt})`,
    count: sql<number>`count(*)`,
  }).from(emails)
    .where(and(eq(emails.status, "sent"), sql`${emails.sentAt} >= datetime('now', '-7 days')`, cc(emails.campaignId)))
    .groupBy(sql`date(${emails.sentAt})`)
    .all();

  // Quality score distribution
  const qualityDist = db.select({
    range: sql<string>`CASE
      WHEN ${leads.webQualityScore} IS NULL THEN 'Sin web'
      WHEN ${leads.webQualityScore} <= 20 THEN 'Muy mala (0-20)'
      WHEN ${leads.webQualityScore} <= 40 THEN 'Mala (21-40)'
      WHEN ${leads.webQualityScore} <= 60 THEN 'Regular (41-60)'
      WHEN ${leads.webQualityScore} <= 80 THEN 'Buena (61-80)'
      ELSE 'Excelente (81-100)'
    END`,
    count: sql<number>`count(*)`,
  }).from(leads)
    .where(and(sql`(${leads.webQualityScore} IS NOT NULL OR ${leads.website} IS NULL)`, cc(leads.campaignId)))
    .groupBy(sql`1`)
    .all();

  // Top cities
  const topCities = db.select({
    city: leads.city,
    count: sql<number>`count(*)`,
  }).from(leads)
    .where(and(sql`${leads.city} IS NOT NULL`, cc(leads.campaignId)))
    .groupBy(leads.city)
    .orderBy(desc(sql`count(*)`))
    .limit(10)
    .all();

  // --- Tracking metrics ---

  const totalOpened = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(isNotNull(emails.openedAt), cc(emails.campaignId)))
    .get()?.count ?? 0;

  const totalClicked = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(isNotNull(emails.clickedAt), cc(emails.campaignId)))
    .get()?.count ?? 0;

  const totalReplied = db.select({ count: sql<number>`count(*)` }).from(replies)
    .where(cc(replies.campaignId))
    .get()?.count ?? 0;

  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
  const clickRate = totalOpened > 0 ? Math.round((totalClicked / totalOpened) * 100) : 0;
  const replyRate = totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0;

  // --- Bounce metrics ---
  const totalBounced = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "failed"), cc(emails.campaignId)))
    .get()?.count ?? 0;

  const bouncedToday = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "failed"), sql`date(${emails.sentAt}) = ${today}`, cc(emails.campaignId)))
    .get()?.count ?? 0;

  const sentLast7 = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "sent"), sql`${emails.sentAt} >= datetime('now', '-7 days')`, cc(emails.campaignId)))
    .get()?.count ?? 0;

  const bouncedLast7 = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "failed"), sql`${emails.sentAt} >= datetime('now', '-7 days')`, cc(emails.campaignId)))
    .get()?.count ?? 0;

  const bounceRate7d = (sentLast7 + bouncedLast7) > 0
    ? Math.round((bouncedLast7 / (sentLast7 + bouncedLast7)) * 100 * 10) / 10
    : 0;

  // --- Service performance ---
  const analyzedLeads = db.select({
    id: leads.id,
    analysisJson: leads.analysisJson,
    status: leads.status,
  }).from(leads)
    .where(and(isNotNull(leads.analysisJson), cc(leads.campaignId)))
    .all();

  const serviceStats: Record<string, { recommended: number; contacted: number }> = {};

  for (const lead of analyzedLeads) {
    try {
      const analysis = JSON.parse(lead.analysisJson!);
      const services = analysis.recommendedServices || [];
      for (const svc of services) {
        if (!serviceStats[svc]) serviceStats[svc] = { recommended: 0, contacted: 0 };
        serviceStats[svc].recommended++;
        if (["email_sent", "wa_sent", "contacted", "replied"].includes(lead.status)) {
          serviceStats[svc].contacted++;
        }
      }
    } catch {
      // skip invalid JSON
    }
  }

  // --- WhatsApp metrics ---
  const waSentToday = db.select({ count: sql<number>`count(*)` }).from(whatsappMessages)
    .where(and(eq(whatsappMessages.status, "sent"), sql`date(${whatsappMessages.sentAt}) = ${today}`, cc(whatsappMessages.campaignId)))
    .get()?.count ?? 0;

  const waTotalSent = db.select({ count: sql<number>`count(*)` }).from(whatsappMessages)
    .where(and(eq(whatsappMessages.status, "sent"), cc(whatsappMessages.campaignId)))
    .get()?.count ?? 0;

  const waPendingReview = db.select({ count: sql<number>`count(*)` }).from(whatsappMessages)
    .where(and(eq(whatsappMessages.status, "draft"), cc(whatsappMessages.campaignId)))
    .get()?.count ?? 0;

  const waDailyLimit = parseInt(getSetting("wa_daily_limit") || "20");

  const waReplies = db.select({ count: sql<number>`count(*)` }).from(replies)
    .where(and(eq(replies.channel, "whatsapp"), cc(replies.campaignId)))
    .get()?.count ?? 0;

  const waReplyRate = waTotalSent > 0 ? Math.round((waReplies / waTotalSent) * 100) : 0;

  const waSentByDay = db.select({
    date: sql<string>`date(${whatsappMessages.sentAt})`,
    count: sql<number>`count(*)`,
  }).from(whatsappMessages)
    .where(and(eq(whatsappMessages.status, "sent"), sql`${whatsappMessages.sentAt} >= datetime('now', '-7 days')`, cc(whatsappMessages.campaignId)))
    .groupBy(sql`date(${whatsappMessages.sentAt})`)
    .all();

  return {
    totalLeads,
    analyzed,
    sentToday,
    globalDailyLimit,
    autopilotGlobal,
    pendingReview,
    totalSent,
    activeCampaigns,
    pendingJobs,
    statusCounts,
    emailsByDay,
    qualityDist,
    topCities,
    totalOpened,
    totalClicked,
    totalReplied,
    openRate,
    clickRate,
    replyRate,
    totalBounced,
    bouncedToday,
    bounceRate7d,
    serviceStats,
    waSentToday,
    waTotalSent,
    waPendingReview,
    waDailyLimit,
    waReplies,
    waReplyRate,
    waSentByDay,
  };
}

export function getTodayMetrics(): TodayMetrics {
  const today = new Date().toISOString().split("T")[0];

  // Pending review: draft emails + WA messages
  const pendingEmails = db.select({
    email: emails,
    leadName: leads.name,
    leadCity: leads.city,
    leadCategory: leads.category,
    campaignName: campaigns.name,
  })
    .from(emails)
    .leftJoin(leads, eq(emails.leadId, leads.id))
    .leftJoin(campaigns, eq(emails.campaignId, campaigns.id))
    .where(eq(emails.status, "draft"))
    .all();

  const pendingWa = db.select({
    message: whatsappMessages,
    leadName: leads.name,
    leadCity: leads.city,
  })
    .from(whatsappMessages)
    .leftJoin(leads, eq(whatsappMessages.leadId, leads.id))
    .where(eq(whatsappMessages.status, "draft"))
    .all();

  // Ready to send: approved emails
  const readyToSend = db.select({ count: sql<number>`count(*)` })
    .from(emails)
    .where(eq(emails.status, "approved"))
    .get()?.count ?? 0;

  // Approved WA
  const readyToSendWa = db.select({ count: sql<number>`count(*)` })
    .from(whatsappMessages)
    .where(eq(whatsappMessages.status, "approved"))
    .get()?.count ?? 0;

  // Active sequences due today
  const activeSequences = db.select({ count: sql<number>`count(*)` })
    .from(sequenceEnrollments)
    .where(and(
      eq(sequenceEnrollments.status, "active"),
      sql`date(${sequenceEnrollments.nextActionAt}) <= ${today}`
    ))
    .get()?.count ?? 0;

  // Emails sent today
  const sentToday = db.select({ count: sql<number>`count(*)` })
    .from(emails)
    .where(and(eq(emails.status, "sent"), sql`date(${emails.sentAt}) = ${today}`))
    .get()?.count ?? 0;

  // WA sent today
  const waSentToday = db.select({ count: sql<number>`count(*)` })
    .from(whatsappMessages)
    .where(and(eq(whatsappMessages.status, "sent"), sql`date(${whatsappMessages.sentAt}) = ${today}`))
    .get()?.count ?? 0;

  const globalDailyLimit = parseInt(getSetting("global_daily_limit") || "50");

  // Warmup effective limit
  const warmupEnabled = getSetting("warmup_enabled") === "true";
  let effectiveLimit = globalDailyLimit;
  if (warmupEnabled) {
    const warmupDay = parseInt(getSetting("warmup_day") || "1");
    const startLimit = parseInt(getSetting("warmup_start_limit") || "5");
    const increment = parseInt(getSetting("warmup_increment") || "5");
    const maxLimit = parseInt(getSetting("warmup_max_limit") || "50");
    effectiveLimit = Math.min(startLimit + (warmupDay - 1) * increment, maxLimit, globalDailyLimit);
  }

  // Pending jobs
  const pendingJobs = db.select({ count: sql<number>`count(*)` })
    .from(jobQueue)
    .where(eq(jobQueue.status, "pending"))
    .get()?.count ?? 0;

  return {
    pendingEmails,
    pendingWa,
    readyToSend,
    readyToSendWa,
    activeSequences,
    sentToday,
    waSentToday,
    effectiveLimit,
    pendingJobs,
  };
}

// Sample rows for the dashboard's pending / approved / sent columns plus the
// reply monitor. Reuses the join already proven in getTodayMetrics but returns a
// normalized, channel-tagged shape and is campaign-aware.
export function getDashboardSamples(campaignId?: number | null): DashboardSamples {
  const today = new Date().toISOString().split("T")[0];
  const camp = campaignId ?? null;
  const cc = (col: Column) => (camp != null ? eq(col, camp) : undefined);
  const byDesc = (k: keyof LeadSampleRow) => (x: LeadSampleRow, y: LeadSampleRow) =>
    String(y[k] ?? "").localeCompare(String(x[k] ?? ""));

  const emailRows = (status: "draft" | "approved" | "sent", todayOnly = false): LeadSampleRow[] =>
    db.select({
      id: emails.id,
      leadId: emails.leadId,
      leadName: leads.name,
      leadCity: leads.city,
      campaignName: campaigns.name,
      preview: emails.subject,
      createdAt: emails.createdAt,
      sentAt: emails.sentAt,
    })
      .from(emails)
      .leftJoin(leads, eq(emails.leadId, leads.id))
      .leftJoin(campaigns, eq(emails.campaignId, campaigns.id))
      .where(and(
        eq(emails.status, status),
        todayOnly ? sql`date(${emails.sentAt}) = ${today}` : undefined,
        cc(emails.campaignId),
      ))
      .orderBy(desc(todayOnly ? emails.sentAt : emails.createdAt))
      .limit(6)
      .all()
      .map((r) => ({ channel: "email" as const, ...r })) as unknown as LeadSampleRow[];

  const waRows = (status: "draft" | "approved" | "sent", todayOnly = false): LeadSampleRow[] =>
    db.select({
      id: whatsappMessages.id,
      leadId: whatsappMessages.leadId,
      leadName: leads.name,
      leadCity: leads.city,
      campaignName: campaigns.name,
      preview: whatsappMessages.body,
      createdAt: whatsappMessages.createdAt,
      sentAt: whatsappMessages.sentAt,
    })
      .from(whatsappMessages)
      .leftJoin(leads, eq(whatsappMessages.leadId, leads.id))
      .leftJoin(campaigns, eq(whatsappMessages.campaignId, campaigns.id))
      .where(and(
        eq(whatsappMessages.status, status),
        todayOnly ? sql`date(${whatsappMessages.sentAt}) = ${today}` : undefined,
        cc(whatsappMessages.campaignId),
      ))
      .orderBy(desc(todayOnly ? whatsappMessages.sentAt : whatsappMessages.createdAt))
      .limit(6)
      .all()
      .map((r) => ({ channel: "whatsapp" as const, ...r })) as unknown as LeadSampleRow[];

  const pending = [...emailRows("draft"), ...waRows("draft")].sort(byDesc("createdAt")).slice(0, 6);
  const approved = [...emailRows("approved"), ...waRows("approved")].sort(byDesc("createdAt")).slice(0, 6);
  const sentToday = [...emailRows("sent", true), ...waRows("sent", true)].sort(byDesc("sentAt")).slice(0, 6);

  const recentReplies = db.select({
    id: replies.id,
    leadId: replies.leadId,
    leadName: leads.name,
    channel: replies.channel,
    fromAddress: replies.fromAddress,
    body: replies.body,
    status: replies.status,
    intent: replies.intent,
    receivedAt: replies.receivedAt,
  })
    .from(replies)
    .leftJoin(leads, eq(replies.leadId, leads.id))
    .where(cc(replies.campaignId))
    .orderBy(desc(replies.receivedAt))
    .limit(8)
    .all() as unknown as ReplySampleRow[];

  const countOf = (q: { get(): { count: number } | undefined }) => q.get()?.count ?? 0;
  const c = sql<number>`count(*)`;

  const counts = {
    pending:
      countOf(db.select({ count: c }).from(emails).where(and(eq(emails.status, "draft"), cc(emails.campaignId)))) +
      countOf(db.select({ count: c }).from(whatsappMessages).where(and(eq(whatsappMessages.status, "draft"), cc(whatsappMessages.campaignId)))),
    approved:
      countOf(db.select({ count: c }).from(emails).where(and(eq(emails.status, "approved"), cc(emails.campaignId)))) +
      countOf(db.select({ count: c }).from(whatsappMessages).where(and(eq(whatsappMessages.status, "approved"), cc(whatsappMessages.campaignId)))),
    sentToday:
      countOf(db.select({ count: c }).from(emails).where(and(eq(emails.status, "sent"), sql`date(${emails.sentAt}) = ${today}`, cc(emails.campaignId)))) +
      countOf(db.select({ count: c }).from(whatsappMessages).where(and(eq(whatsappMessages.status, "sent"), sql`date(${whatsappMessages.sentAt}) = ${today}`, cc(whatsappMessages.campaignId)))),
    repliesRecent: countOf(
      db.select({ count: c }).from(replies).where(and(sql`${replies.receivedAt} >= datetime('now', '-7 days')`, cc(replies.campaignId)))
    ),
    repliesUnread: countOf(
      db.select({ count: c }).from(replies).where(and(eq(replies.status, "unread"), cc(replies.campaignId)))
    ),
    failed:
      countOf(db.select({ count: c }).from(emails).where(and(eq(emails.status, "failed"), cc(emails.campaignId)))) +
      countOf(db.select({ count: c }).from(whatsappMessages).where(and(eq(whatsappMessages.status, "failed"), cc(whatsappMessages.campaignId)))),
  };

  return { pending, approved, sentToday, recentReplies, counts };
}

export interface RepliesQuery {
  campaignId?: number | null;
  status?: "unread" | "handled";
  channel?: "email" | "whatsapp";
  limit?: number;
}

// Read inbound replies with their AI-classified intent. Used by the chat agent's
// get_replies tool so the assistant can read the inbox, not just count it.
export function getReplies(opts: RepliesQuery = {}) {
  const conds = [
    opts.campaignId != null ? eq(replies.campaignId, opts.campaignId) : undefined,
    opts.status ? eq(replies.status, opts.status) : undefined,
    opts.channel ? eq(replies.channel, opts.channel) : undefined,
  ].filter(Boolean);

  return db.select({
    id: replies.id,
    leadId: replies.leadId,
    leadName: leads.name,
    channel: replies.channel,
    fromAddress: replies.fromAddress,
    body: replies.body,
    status: replies.status,
    intent: replies.intent,
    receivedAt: replies.receivedAt,
  })
    .from(replies)
    .leftJoin(leads, eq(replies.leadId, leads.id))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(replies.receivedAt))
    .limit(Math.min(opts.limit ?? 30, 100))
    .all();
}

export function getRecentActivity(opts?: RecentActivityOpts) {
  const page = opts?.page ?? 1;
  const limit = opts?.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (opts?.type) {
    conditions.push(eq(activityLog.type, opts.type as typeof activityLog.type.enumValues[number]));
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db.select().from(activityLog)
    .where(where)
    .orderBy(desc(activityLog.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  return { activity: rows, page, limit };
}
