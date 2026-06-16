import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { replies, leads } from "@/db/schema";
import { eq, desc } from "drizzle-orm";

// GET: recent incoming replies (email + WhatsApp), newest first.
// Auth is enforced by src/proxy.ts. Optional ?channel=email|whatsapp filter.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channel = searchParams.get("channel");
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 200);

  const where =
    channel === "email" || channel === "whatsapp"
      ? eq(replies.channel, channel)
      : undefined;

  const rows = db
    .select({
      id: replies.id,
      leadId: replies.leadId,
      campaignId: replies.campaignId,
      channel: replies.channel,
      fromAddress: replies.fromAddress,
      body: replies.body,
      receivedAt: replies.receivedAt,
      leadName: leads.name,
      leadCity: leads.city,
    })
    .from(replies)
    .leftJoin(leads, eq(leads.id, replies.leadId))
    .where(where)
    .orderBy(desc(replies.receivedAt))
    .limit(limit)
    .all();

  return NextResponse.json({ replies: rows });
}
