import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leads, emails, activityLog, whatsappMessages } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const lead = db.select().from(leads).where(eq(leads.id, Number(id))).get();
  if (!lead) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const leadEmails = db.select().from(emails).where(eq(emails.leadId, Number(id))).orderBy(desc(emails.createdAt)).all();

  const leadWhatsapps = db.select().from(whatsappMessages).where(eq(whatsappMessages.leadId, Number(id))).orderBy(desc(whatsappMessages.createdAt)).all();

  const activity = db.select().from(activityLog).where(eq(activityLog.leadId, Number(id))).orderBy(desc(activityLog.createdAt)).limit(50).all();

  return NextResponse.json({ lead, emails: leadEmails, whatsapps: leadWhatsapps, activity });
}
