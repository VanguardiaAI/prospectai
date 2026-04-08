import { NextRequest, NextResponse } from "next/server";
import { db, getSetting } from "@/db";
import { whatsappMessages, leads, campaigns } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { sendWhatsAppMessage, isWhatsAppReady } from "@/lib/whatsapp-client";
import { generateWhatsApp, regenerateWhatsApp, detectCountryFromPhone } from "@/lib/gemini";
import type { WebAnalysis } from "@/lib/gemini";
import { logActivity } from "@/lib/activity";

// GET: list WhatsApp messages with filters
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status") || "draft";
  const limitParam = parseInt(searchParams.get("limit") || "100");

  const messages = db
    .select({
      message: whatsappMessages,
      leadName: leads.name,
      leadCategory: leads.category,
      leadCity: leads.city,
      leadWebsite: leads.website,
      leadPhone: leads.phone,
      leadScore: leads.webQualityScore,
      leadOpportunity: leads.opportunityScore,
      leadAnalysisSummary: leads.analysisSummary,
    })
    .from(whatsappMessages)
    .leftJoin(leads, eq(whatsappMessages.leadId, leads.id))
    .where(eq(whatsappMessages.status, status as "draft" | "approved" | "rejected" | "sent" | "failed"))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(limitParam)
    .all();

  return NextResponse.json({ messages });
}

// PUT: update message (edit, approve, reject, bulk approve)
export async function PUT(req: NextRequest) {
  const body = await req.json();

  // Bulk approve
  if (body.bulkApprove && body.ids) {
    for (const id of body.ids as number[]) {
      db.update(whatsappMessages)
        .set({ status: "approved", updatedAt: new Date().toISOString() })
        .where(eq(whatsappMessages.id, id))
        .run();
    }
    return NextResponse.json({ success: true });
  }

  const { id, ...updates } = body;
  if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

  const allowedFields: Record<string, string> = {
    body: "body",
    status: "status",
  };

  const setData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  for (const [key, col] of Object.entries(allowedFields)) {
    if (updates[key] !== undefined) setData[col] = updates[key];
  }

  db.update(whatsappMessages).set(setData).where(eq(whatsappMessages.id, id)).run();

  // Update lead status if approving/rejecting
  if (updates.status === "approved" || updates.status === "rejected") {
    const msg = db.select().from(whatsappMessages).where(eq(whatsappMessages.id, id)).get();
    if (msg) {
      const leadStatus = updates.status === "approved" ? "wa_approved" : "rejected";
      db.update(leads).set({ status: leadStatus }).where(eq(leads.id, msg.leadId)).run();
      logActivity(
        updates.status === "approved" ? "wa_approved" : "wa_rejected",
        `WhatsApp ${updates.status === "approved" ? "aprobado" : "rechazado"} para lead #${msg.leadId}`,
        { leadId: msg.leadId, campaignId: msg.campaignId ?? undefined }
      );
    }
  }

  return NextResponse.json({ success: true });
}

// POST: generate, regenerate, or send WhatsApp message
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Regenerate existing message
  if (body.messageId) {
    const msg = db.select().from(whatsappMessages).where(eq(whatsappMessages.id, body.messageId)).get();
    if (!msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const lead = db.select().from(leads).where(eq(leads.id, msg.leadId)).get();
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const analysis: WebAnalysis | null = lead.analysisJson ? JSON.parse(lead.analysisJson) : null;
    const fromName = getSetting("from_name") || getSetting("agency_name") || "ProspectAI";

    const generated = await regenerateWhatsApp(
      lead.name, lead.category, lead.city, lead.website,
      analysis, body.tone || msg.tone, fromName,
      msg.body, body.instructions || "",
      detectCountryFromPhone(lead.phone) || undefined
    );

    db.update(whatsappMessages).set({
      body: generated.message,
      tone: body.tone || msg.tone,
      status: "draft",
      updatedAt: new Date().toISOString(),
    }).where(eq(whatsappMessages.id, msg.id)).run();

    return NextResponse.json({ success: true });
  }

  // Generate new message for a lead
  if (body.leadId && body.action === "generate") {
    const lead = db.select().from(leads).where(eq(leads.id, body.leadId)).get();
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    if (!lead.phone) return NextResponse.json({ error: "Lead has no phone number" }, { status: 400 });

    const analysis: WebAnalysis | null = lead.analysisJson ? JSON.parse(lead.analysisJson) : null;
    const campaign = lead.campaignId
      ? db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).get()
      : null;

    const tone = body.tone || campaign?.defaultTone || getSetting("default_tone") || "profesional";
    const fromName = getSetting("from_name") || getSetting("agency_name") || "ProspectAI";

    const generated = await generateWhatsApp(
      lead.name, lead.category, lead.city, lead.website, analysis, tone, fromName,
      undefined, undefined, detectCountryFromPhone(lead.phone) || undefined
    );

    db.insert(whatsappMessages).values({
      leadId: lead.id,
      campaignId: lead.campaignId,
      toPhone: lead.phone,
      body: generated.message,
      tone,
      status: "draft",
    }).run();

    db.update(leads).set({ status: "wa_generated" }).where(eq(leads.id, lead.id)).run();

    logActivity("wa_generated", `WhatsApp generado para ${lead.name}`, {
      leadId: lead.id,
      campaignId: lead.campaignId ?? undefined,
    });

    return NextResponse.json({ success: true });
  }

  // Create manual message for a lead
  if (body.leadId && body.action === "manual") {
    const lead = db.select().from(leads).where(eq(leads.id, body.leadId)).get();
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    if (!lead.phone) return NextResponse.json({ error: "Lead has no phone number" }, { status: 400 });

    db.insert(whatsappMessages).values({
      leadId: lead.id,
      campaignId: lead.campaignId,
      toPhone: lead.phone,
      body: body.body || "",
      tone: body.tone || "profesional",
      status: "draft",
    }).run();

    db.update(leads).set({ status: "wa_generated" }).where(eq(leads.id, lead.id)).run();

    return NextResponse.json({ success: true });
  }

  // Send approved message
  if (body.messageId && body.action === "send") {
    const msg = db.select().from(whatsappMessages).where(eq(whatsappMessages.id, body.messageId)).get();
    if (!msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });
    if (msg.status !== "approved") return NextResponse.json({ error: "Message not approved" }, { status: 400 });

    if (!isWhatsAppReady()) {
      return NextResponse.json({ error: "WhatsApp no conectado" }, { status: 400 });
    }

    const result = await sendWhatsAppMessage(msg.toPhone, msg.body);

    if (result.success) {
      db.update(whatsappMessages).set({
        status: "sent",
        waMessageId: result.messageId,
        sentAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }).where(eq(whatsappMessages.id, msg.id)).run();

      db.update(leads).set({
        status: "wa_sent",
        waSentAt: new Date().toISOString(),
      }).where(eq(leads.id, msg.leadId)).run();

      logActivity("wa_sent", `WhatsApp enviado a ${msg.toPhone}`, {
        leadId: msg.leadId,
        campaignId: msg.campaignId ?? undefined,
      });

      return NextResponse.json({ success: true });
    } else {
      db.update(whatsappMessages).set({
        status: "failed",
        updatedAt: new Date().toISOString(),
      }).where(eq(whatsappMessages.id, msg.id)).run();

      logActivity("wa_failed", `Error enviando WhatsApp a ${msg.toPhone}: ${result.error}`, {
        leadId: msg.leadId,
      });

      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
