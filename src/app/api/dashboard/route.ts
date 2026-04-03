import { NextResponse } from "next/server";
import { db, getSetting } from "@/db";
import { leads, emails, campaigns, jobQueue, replies } from "@/db/schema";
import { eq, sql, and, desc, isNotNull } from "drizzle-orm";

export async function GET() {
  const today = new Date().toISOString().split("T")[0];

  // Total leads
  const totalLeads = db.select({ count: sql<number>`count(*)` }).from(leads).get()?.count ?? 0;

  // Leads by status
  const statusCounts = db.select({
    status: leads.status,
    count: sql<number>`count(*)`,
  }).from(leads).groupBy(leads.status).all();

  // Analyzed count
  const analyzed = statusCounts.find(s => ["analyzed", "email_generated", "email_approved", "email_sent", "rejected"].includes(s.status))
    ? statusCounts.filter(s => ["analyzed", "email_generated", "email_approved", "email_sent", "rejected"].includes(s.status))
      .reduce((sum, s) => sum + s.count, 0)
    : 0;

  // Emails sent today
  const sentToday = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "sent"), sql`date(${emails.sentAt}) = ${today}`))
    .get()?.count ?? 0;

  const globalDailyLimit = parseInt(getSetting("global_daily_limit") || "50");
  const autopilotGlobal = getSetting("autopilot_global") === "true";

  // Pending review
  const pendingReview = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(eq(emails.status, "draft"))
    .get()?.count ?? 0;

  // Total sent
  const totalSent = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(eq(emails.status, "sent"))
    .get()?.count ?? 0;

  // Active campaigns
  const activeCampaigns = db.select({ count: sql<number>`count(*)` }).from(campaigns)
    .where(eq(campaigns.status, "active"))
    .get()?.count ?? 0;

  // Pending jobs
  const pendingJobs = db.select({ count: sql<number>`count(*)` }).from(jobQueue)
    .where(eq(jobQueue.status, "pending"))
    .get()?.count ?? 0;

  // Emails sent per day (last 7 days)
  const emailsByDay = db.select({
    date: sql<string>`date(${emails.sentAt})`,
    count: sql<number>`count(*)`,
  }).from(emails)
    .where(and(eq(emails.status, "sent"), sql`${emails.sentAt} >= datetime('now', '-7 days')`))
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
    .where(sql`${leads.webQualityScore} IS NOT NULL OR ${leads.website} IS NULL`)
    .groupBy(sql`1`)
    .all();

  // Top cities
  const topCities = db.select({
    city: leads.city,
    count: sql<number>`count(*)`,
  }).from(leads)
    .where(sql`${leads.city} IS NOT NULL`)
    .groupBy(leads.city)
    .orderBy(desc(sql`count(*)`))
    .limit(10)
    .all();

  // --- Tracking metrics ---

  // Total opens
  const totalOpened = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(isNotNull(emails.openedAt))
    .get()?.count ?? 0;

  // Total clicks
  const totalClicked = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(isNotNull(emails.clickedAt))
    .get()?.count ?? 0;

  // Total replies
  const totalReplied = db.select({ count: sql<number>`count(*)` }).from(replies)
    .get()?.count ?? 0;

  const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
  const clickRate = totalOpened > 0 ? Math.round((totalClicked / totalOpened) * 100) : 0;
  const replyRate = totalSent > 0 ? Math.round((totalReplied / totalSent) * 100) : 0;

  // --- Bounce metrics ---
  const totalBounced = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(eq(emails.status, "failed"))
    .get()?.count ?? 0;

  const bouncedToday = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "failed"), sql`date(${emails.sentAt}) = ${today}`))
    .get()?.count ?? 0;

  // Bounce rate over last 7 days (window where reputation matters most)
  const sentLast7 = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "sent"), sql`${emails.sentAt} >= datetime('now', '-7 days')`))
    .get()?.count ?? 0;

  const bouncedLast7 = db.select({ count: sql<number>`count(*)` }).from(emails)
    .where(and(eq(emails.status, "failed"), sql`${emails.sentAt} >= datetime('now', '-7 days')`))
    .get()?.count ?? 0;

  const bounceRate7d = (sentLast7 + bouncedLast7) > 0
    ? Math.round((bouncedLast7 / (sentLast7 + bouncedLast7)) * 100 * 10) / 10
    : 0;

  // --- Service performance ---

  // Parse analysis JSON to count recommended services
  const analyzedLeads = db.select({
    id: leads.id,
    analysisJson: leads.analysisJson,
    status: leads.status,
  }).from(leads)
    .where(isNotNull(leads.analysisJson))
    .all();

  const serviceStats: Record<string, { recommended: number; contacted: number }> = {};

  for (const lead of analyzedLeads) {
    try {
      const analysis = JSON.parse(lead.analysisJson!);
      const services = analysis.recommendedServices || [];
      for (const svc of services) {
        if (!serviceStats[svc]) serviceStats[svc] = { recommended: 0, contacted: 0 };
        serviceStats[svc].recommended++;
        if (["email_sent", "wa_sent", "contacted"].includes(lead.status)) {
          serviceStats[svc].contacted++;
        }
      }
    } catch {
      // skip invalid JSON
    }
  }

  return NextResponse.json({
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
    // Tracking
    totalOpened,
    totalClicked,
    totalReplied,
    openRate,
    clickRate,
    replyRate,
    // Bounces
    totalBounced,
    bouncedToday,
    bounceRate7d,
    // Services
    serviceStats,
  });
}
