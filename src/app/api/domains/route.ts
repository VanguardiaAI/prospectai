import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sendingDomains, emails } from "@/db/schema";
import { eq, sql, and } from "drizzle-orm";
import { validateBody, createDomainSchema, updateDomainSchema } from "@/lib/validations";

// GET: List all sending domains with today's stats
export async function GET() {
  const domains = db.select().from(sendingDomains).all();
  const today = new Date().toISOString().split("T")[0];

  const enriched = domains.map((domain) => {
    const sentToday = db.select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(and(
        eq(emails.fromEmail, domain.fromEmail),
        eq(emails.status, "sent"),
        sql`date(${emails.sentAt}) = ${today}`
      ))
      .get()?.count ?? 0;

    const totalSent = db.select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(and(
        eq(emails.fromEmail, domain.fromEmail),
        eq(emails.status, "sent")
      ))
      .get()?.count ?? 0;

    const bounces = db.select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(and(
        eq(emails.fromEmail, domain.fromEmail),
        eq(emails.status, "failed")
      ))
      .get()?.count ?? 0;

    return { ...domain, sentToday, totalSent, bounces };
  });

  return NextResponse.json(enriched);
}

// POST: Add new domain
export async function POST(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(createDomainSchema, body);
  if (!v.success) return v.response;

  const { domain, fromEmail, fromName, dailyLimit, resendApiKey } = v.data;

  const result = db.insert(sendingDomains).values({
    domain,
    fromEmail,
    fromName,
    dailyLimit: dailyLimit || 30,
    resendApiKey: resendApiKey || null,
  }).run();

  return NextResponse.json({ id: result.lastInsertRowid });
}

// PUT: Update domain
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(updateDomainSchema, body);
  if (!v.success) return v.response;

  const { id, ...updates } = v.data;

  const allowed: Record<string, unknown> = {};
  if (updates.domain !== undefined) allowed.domain = updates.domain;
  if (updates.fromEmail !== undefined) allowed.fromEmail = updates.fromEmail;
  if (updates.fromName !== undefined) allowed.fromName = updates.fromName;
  if (updates.dailyLimit !== undefined) allowed.dailyLimit = updates.dailyLimit;
  if (updates.status !== undefined) allowed.status = updates.status;
  if (updates.resendApiKey !== undefined) allowed.resendApiKey = updates.resendApiKey;
  if (updates.warmupDay !== undefined) allowed.warmupDay = updates.warmupDay;
  if (updates.warmupStartLimit !== undefined) allowed.warmupStartLimit = updates.warmupStartLimit;
  if (updates.warmupIncrement !== undefined) allowed.warmupIncrement = updates.warmupIncrement;

  db.update(sendingDomains).set(allowed).where(eq(sendingDomains.id, id)).run();

  return NextResponse.json({ success: true });
}

// DELETE: Remove domain
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id") || "0");

  if (!id) {
    return NextResponse.json({ error: "Missing domain id" }, { status: 400 });
  }

  db.delete(sendingDomains).where(eq(sendingDomains.id, id)).run();

  return NextResponse.json({ success: true });
}
