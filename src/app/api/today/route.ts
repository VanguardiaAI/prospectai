import { NextResponse } from "next/server";
import { db, getSetting } from "@/db";
import { emails, whatsappMessages, leads, sequenceEnrollments, campaigns, jobQueue } from "@/db/schema";
import { eq, and, sql } from "drizzle-orm";

export async function GET() {
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

  return NextResponse.json({
    pendingEmails,
    pendingWa,
    readyToSend,
    readyToSendWa,
    activeSequences,
    sentToday,
    waSentToday,
    effectiveLimit,
    pendingJobs,
  });
}
