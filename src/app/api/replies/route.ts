import { NextRequest, NextResponse } from "next/server";
import { db, getSetting } from "@/db";
import { replies, leads, campaigns, emails, whatsappMessages } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { draftConversationReply } from "@/lib/ai/reply-assistant";
import { getLeadConversation, getReplySubject } from "@/lib/conversation";
import { sendEmail } from "@/lib/email-sender";
import { sendWhatsAppMessage } from "@/lib/whatsapp-client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Auth is enforced by src/proxy.ts.

function resolveAgencyProfileId(campaignId: number | null): number | null {
  if (!campaignId) return null;
  return db.select({ id: campaigns.agencyProfileId }).from(campaigns).where(eq(campaigns.id, campaignId)).get()?.id ?? null;
}

function textToHtml(text: string): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text
    .trim()
    .split(/\n{2,}/)
    .map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`)
    .join("\n");
}

// GET: recent incoming replies (email + WhatsApp), newest first.
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
      suggestedReply: replies.suggestedReply,
      status: replies.status,
      intent: replies.intent,
      handledAt: replies.handledAt,
      receivedAt: replies.receivedAt,
      leadName: leads.name,
      leadCity: leads.city,
      leadCategory: leads.category,
    })
    .from(replies)
    .leftJoin(leads, eq(leads.id, replies.leadId))
    .where(conds.length ? and(...conds) : undefined)
    .orderBy(desc(replies.receivedAt))
    .limit(limit)
    .all();

  return NextResponse.json({ replies: rows });
}

// POST { replyId, action: "suggest", instructions? }: generate/regenerate a
// suggested reply with the full conversation + enriched agency context.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body?.action !== "suggest") {
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
  const id = Number(body?.replyId ?? body?.id);
  if (!id || !Number.isFinite(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  const reply = db.select().from(replies).where(eq(replies.id, id)).get();
  if (!reply) return NextResponse.json({ error: "reply not found" }, { status: 404 });
  if (!reply.body?.trim()) return NextResponse.json({ error: "empty reply" }, { status: 400 });

  const lead = db.select().from(leads).where(eq(leads.id, reply.leadId)).get();
  const suggestion = await draftConversationReply({
    leadId: reply.leadId,
    channel: reply.channel === "whatsapp" ? "whatsapp" : "email",
    latestInboundText: reply.body,
    agencyProfileId: resolveAgencyProfileId(reply.campaignId),
    leadName: lead?.name ?? null,
    leadCategory: lead?.category ?? null,
    instructions: typeof body?.instructions === "string" ? body.instructions : undefined,
  });

  if (!suggestion) return NextResponse.json({ error: "no_suggestion" }, { status: 500 });

  db.update(replies)
    .set({ suggestedReply: suggestion, suggestedReplyAt: new Date().toISOString() })
    .where(eq(replies.id, id))
    .run();

  return NextResponse.json({ suggestion });
}

// PUT: triage a reply { id, action: "handle" | "unhandle" }, OR send an approved
// reply { id, action: "approve_send", body }. Replies are conversational and
// time-sensitive, so they send immediately on approval (not via the cold-send
// window/quota). Never auto-sent — only on this explicit user action.
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!id || !Number.isFinite(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }

  if (body?.action === "approve_send") {
    const text = typeof body?.body === "string" ? body.body.trim() : "";
    if (!text) return NextResponse.json({ error: "empty body" }, { status: 400 });

    const reply = db.select().from(replies).where(eq(replies.id, id)).get();
    if (!reply) return NextResponse.json({ error: "reply not found" }, { status: 404 });
    const channel = reply.channel === "whatsapp" ? "whatsapp" : "email";
    const now = new Date().toISOString();

    if (channel === "email") {
      const fromName = getSetting("from_name") || getSetting("agency_name") || "ProspectAI";
      const fromEmail = getSetting("from_email") || "";
      if (!fromEmail) return NextResponse.json({ error: "from_email not configured" }, { status: 400 });
      const replyTo = getSetting("reply_to_email") || undefined;
      const subject = getReplySubject(getLeadConversation(reply.leadId));
      const html = textToHtml(text);
      const res = await sendEmail({ to: reply.fromAddress, from: `${fromName} <${fromEmail}>`, subject, html, text, replyTo });
      if (!res.success) return NextResponse.json({ error: res.error || "send failed" }, { status: 502 });
      db.insert(emails).values({
        leadId: reply.leadId,
        campaignId: reply.campaignId,
        toEmail: reply.fromAddress,
        fromEmail,
        subject,
        bodyHtml: html,
        bodyText: text,
        status: "sent",
        resendId: res.id,
        sentAt: now,
      }).run();
    } else {
      const res = await sendWhatsAppMessage(reply.fromAddress, text);
      if (!res.success) return NextResponse.json({ error: res.error || "send failed" }, { status: 502 });
      db.insert(whatsappMessages).values({
        leadId: reply.leadId,
        campaignId: reply.campaignId,
        toPhone: reply.fromAddress,
        body: text,
        status: "sent",
        waMessageId: res.messageId,
        sentAt: now,
      }).run();
    }

    db.update(replies)
      .set({ status: "handled", handledAt: now, suggestedReply: text, suggestedReplyAt: now })
      .where(eq(replies.id, id))
      .run();

    return NextResponse.json({ success: true, sent: true });
  }

  const action = body?.action === "unhandle" ? "unhandle" : "handle";
  if (action === "unhandle") {
    db.update(replies).set({ status: "unread", handledAt: null }).where(eq(replies.id, id)).run();
  } else {
    db.update(replies).set({ status: "handled", handledAt: new Date().toISOString() }).where(eq(replies.id, id)).run();
  }
  return NextResponse.json({ success: true, id, status: action === "unhandle" ? "unread" : "handled" });
}
