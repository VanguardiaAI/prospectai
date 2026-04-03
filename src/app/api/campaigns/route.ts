import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { campaigns, emails, replies } from "@/db/schema";
import { eq, and, sql, isNotNull } from "drizzle-orm";
import { logActivity } from "@/lib/activity";

export async function GET() {
  const all = db.select().from(campaigns).orderBy(campaigns.createdAt).all();

  // Gather per-campaign email metrics in a single query each
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

  const enriched = all.map((c) => {
    const sent = sentMap[c.id] ?? 0;
    const opened = openedMap[c.id] ?? 0;
    const repliesCount = replyMap[c.id] ?? 0;
    const openRate = sent > 0 ? Math.round((opened / sent) * 100) : 0;
    return { ...c, metrics: { sent, opened, openRate, replies: repliesCount } };
  });

  return NextResponse.json(enriched);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const result = db.insert(campaigns).values({
    name: body.name,
    description: body.description || null,
    dailyLimit: body.dailyLimit ?? 20,
    qualityThreshold: body.qualityThreshold ?? 40,
    autopilot: body.autopilot ?? false,
    defaultTone: body.defaultTone || "profesional",
  }).returning().get();

  logActivity("campaign_change", `Campaña "${result.name}" creada`, { campaignId: result.id });
  return NextResponse.json(result, { status: 201 });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  if (!body.id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name;
  if (body.description !== undefined) updates.description = body.description;
  if (body.dailyLimit !== undefined) updates.dailyLimit = body.dailyLimit;
  if (body.qualityThreshold !== undefined) updates.qualityThreshold = body.qualityThreshold;
  if (body.autopilot !== undefined) updates.autopilot = body.autopilot;
  if (body.defaultTone !== undefined) updates.defaultTone = body.defaultTone;
  if (body.status !== undefined) updates.status = body.status;

  const result = db.update(campaigns).set(updates).where(eq(campaigns.id, body.id)).returning().get();

  logActivity("campaign_change", `Campaña "${result.name}" actualizada`, { campaignId: result.id });
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const campaign = db.select().from(campaigns).where(eq(campaigns.id, Number(id))).get();
  if (campaign) {
    db.delete(campaigns).where(eq(campaigns.id, Number(id))).run();
    logActivity("campaign_change", `Campaña "${campaign.name}" eliminada`);
  }
  return NextResponse.json({ success: true });
}
