import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { replies, leads } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";

// GET: recent incoming replies (email + WhatsApp), newest first.
// Auth is enforced by src/proxy.ts.
// Optional filters: ?channel=email|whatsapp, ?status=unread|handled, ?campaignId=N
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const channel = searchParams.get("channel");
  const status = searchParams.get("status");
  const campaignRaw = searchParams.get("campaignId");
  const campaignId = campaignRaw && campaignRaw !== "all" ? Number(campaignRaw) : null;
  const limit = Math.min(Number(searchParams.get("limit")) || 100, 200);

  const conds = [
    channel === "email" || channel === "whatsapp" ? eq(replies.channel, channel) : undefined,
    status === "unread" || status === "handled" ? eq(replies.status, status) : undefined,
    campaignId != null && Number.isFinite(campaignId) ? eq(replies.campaignId, campaignId) : undefined,
  ].filter(Boolean);

  const rows = db
    .select({
      id: replies.id,
      leadId: replies.leadId,
      campaignId: replies.campaignId,
      channel: replies.channel,
      fromAddress: replies.fromAddress,
      body: replies.body,
      status: replies.status,
      intent: replies.intent,
      handledAt: replies.handledAt,
      receivedAt: replies.receivedAt,
      leadName: leads.name,
      leadCity: leads.city,
    })
    .from(replies)
    .leftJoin(leads, eq(leads.id, replies.leadId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(replies.receivedAt))
    .limit(limit)
    .all();

  return NextResponse.json({ replies: rows });
}

// PUT: triage a reply. { id, action: "handle" | "unhandle" }
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  const action = body?.action === "unhandle" ? "unhandle" : "handle";
  if (!id || !Number.isFinite(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (action === "unhandle") {
    db.update(replies).set({ status: "unread", handledAt: null }).where(eq(replies.id, id)).run();
  } else {
    db.update(replies)
      .set({ status: "handled", handledAt: new Date().toISOString() })
      .where(eq(replies.id, id))
      .run();
  }

  return NextResponse.json({ success: true, id, status: action === "unhandle" ? "unread" : "handled" });
}
