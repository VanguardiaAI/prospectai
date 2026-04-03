import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { emails, whatsappMessages } from "@/db/schema";
import { sql, and, gte, lt, eq, isNull, isNotNull } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const month = parseInt(searchParams.get("month") || String(new Date().getMonth() + 1));
  const year = parseInt(searchParams.get("year") || String(new Date().getFullYear()));

  // Build date range for the month (SQLite datetime format: YYYY-MM-DD HH:MM:SS)
  const startDate = `${year}-${String(month).padStart(2, "0")}-01 00:00:00`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const endDate = `${nextYear}-${String(nextMonth).padStart(2, "0")}-01 00:00:00`;

  // Count sent emails grouped by date
  const sentRows = db
    .select({
      date: sql<string>`date(${emails.sentAt})`.as("date"),
      count: sql<number>`count(*)`.as("count"),
    })
    .from(emails)
    .where(
      and(
        isNotNull(emails.sentAt),
        gte(emails.sentAt, startDate),
        lt(emails.sentAt, endDate)
      )
    )
    .groupBy(sql`date(${emails.sentAt})`)
    .all();

  // Count approved emails (pending send) with no sentAt, grouped by createdAt date
  const approvedRows = db
    .select({
      date: sql<string>`date(${emails.createdAt})`.as("date"),
      count: sql<number>`count(*)`.as("count"),
    })
    .from(emails)
    .where(
      and(
        eq(emails.status, "approved"),
        isNull(emails.sentAt),
        gte(emails.createdAt, startDate),
        lt(emails.createdAt, endDate)
      )
    )
    .groupBy(sql`date(${emails.createdAt})`)
    .all();

  // WA sent per day
  const waSentRows = db
    .select({
      date: sql<string>`date(${whatsappMessages.sentAt})`.as("date"),
      count: sql<number>`count(*)`.as("count"),
    })
    .from(whatsappMessages)
    .where(
      and(
        isNotNull(whatsappMessages.sentAt),
        gte(whatsappMessages.sentAt, startDate),
        lt(whatsappMessages.sentAt, endDate)
      )
    )
    .groupBy(sql`date(${whatsappMessages.sentAt})`)
    .all();

  // WA approved (pending send)
  const waApprovedRows = db
    .select({
      date: sql<string>`date(${whatsappMessages.createdAt})`.as("date"),
      count: sql<number>`count(*)`.as("count"),
    })
    .from(whatsappMessages)
    .where(
      and(
        eq(whatsappMessages.status, "approved"),
        gte(whatsappMessages.createdAt, startDate),
        lt(whatsappMessages.createdAt, endDate)
      )
    )
    .groupBy(sql`date(${whatsappMessages.createdAt})`)
    .all();

  // Build a map for the full month
  const daysInMonth = new Date(year, month, 0).getDate();
  const sentMap = new Map(sentRows.map((r) => [r.date, r.count]));
  const approvedMap = new Map(approvedRows.map((r) => [r.date, r.count]));
  const waSentMap = new Map(waSentRows.map((r) => [r.date, r.count]));
  const waApprovedMap = new Map(waApprovedRows.map((r) => [r.date, r.count]));

  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    days.push({
      date: dateStr,
      sent: sentMap.get(dateStr) || 0,
      approved: approvedMap.get(dateStr) || 0,
      waSent: waSentMap.get(dateStr) || 0,
      waApproved: waApprovedMap.get(dateStr) || 0,
    });
  }

  return NextResponse.json({ days, month, year });
}
