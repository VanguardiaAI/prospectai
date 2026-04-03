import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq, like, and, lte, sql, desc, inArray } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");
  const city = searchParams.get("city");
  const status = searchParams.get("status");
  const maxQuality = searchParams.get("maxQuality");
  const search = searchParams.get("search");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  const conditions = [];
  if (campaignId) conditions.push(eq(leads.campaignId, Number(campaignId)));
  if (city) conditions.push(eq(leads.city, city));
  if (status) conditions.push(eq(leads.status, status as typeof leads.status.enumValues[number]));
  if (maxQuality) conditions.push(lte(leads.webQualityScore, Number(maxQuality)));
  if (search) conditions.push(like(leads.name, `%${search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db.select().from(leads).where(where).orderBy(desc(leads.opportunityScore)).limit(limit).offset(offset).all();

  const countResult = db.select({ count: sql<number>`count(*)` }).from(leads).where(where).get();
  const total = countResult?.count ?? 0;

  // Get distinct cities for filter
  const cities = db.selectDistinct({ city: leads.city }).from(leads).all()
    .map(r => r.city).filter(Boolean) as string[];

  return NextResponse.json({ leads: rows, total, page, limit, cities });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();

  // Bulk update: { bulkIds: number[], status?: string, campaignId?: number }
  if (body.bulkIds && Array.isArray(body.bulkIds) && body.bulkIds.length > 0) {
    const updates: Record<string, unknown> = {};
    if (body.status !== undefined) updates.status = body.status;
    if (body.campaignId !== undefined) updates.campaignId = body.campaignId;
    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: "No updates provided" }, { status: 400 });
    }
    db.update(leads).set(updates).where(inArray(leads.id, body.bulkIds)).run();
    return NextResponse.json({ success: true, updated: body.bulkIds.length });
  }

  // Single update
  if (!body.id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const updates: Record<string, unknown> = {};
  if (body.contactEmail !== undefined) updates.contactEmail = body.contactEmail;
  if (body.notes !== undefined) updates.notes = body.notes;
  if (body.status !== undefined) updates.status = body.status;
  if (body.campaignId !== undefined) updates.campaignId = body.campaignId;

  const result = db.update(leads).set(updates).where(eq(leads.id, body.id)).returning().get();
  return NextResponse.json(result);
}

export async function DELETE(req: NextRequest) {
  const body = await req.json();

  if (body.bulkIds && Array.isArray(body.bulkIds) && body.bulkIds.length > 0) {
    db.delete(leads).where(inArray(leads.id, body.bulkIds)).run();
    return NextResponse.json({ success: true, deleted: body.bulkIds.length });
  }

  if (body.id) {
    db.delete(leads).where(eq(leads.id, body.id)).run();
    return NextResponse.json({ success: true, deleted: 1 });
  }

  return NextResponse.json({ error: "ID or bulkIds required" }, { status: 400 });
}
