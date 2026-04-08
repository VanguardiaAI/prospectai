import { NextRequest, NextResponse } from "next/server";
import { db, getSetting } from "@/db";
import { whatsappMessages, leads, campaigns } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { sendWhatsAppMessage, isWhatsAppReady } from "@/lib/whatsapp-client";
import { generateWhatsApp, regenerateWhatsApp, detectCountryFromPhone } from "@/lib/gemini";
import type { WebAnalysis } from "@/lib/gemini";
import { logActivity } from "@/lib/activity";
import { validateBody, bulkApproveWASchema, updateWASchema, waPostSchema } from "@/lib/validations";
import * as messageService from "@/services/message.service";
import { handleServiceError } from "@/services/api-handler";

// GET: list WhatsApp messages with filters
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const data = messageService.listWhatsAppMessages({
      status: searchParams.get("status") || undefined,
      limit: parseInt(searchParams.get("limit") || "100"),
    });
    return NextResponse.json(data);
  } catch (err) {
    return handleServiceError(err);
  }
}

// PUT: update message (edit, approve, reject, bulk approve)
export async function PUT(req: NextRequest) {
  const body = await req.json();

  try {
    // Bulk approve
    if (body.bulkApprove) {
      const v = validateBody(bulkApproveWASchema, body);
      if (!v.success) return v.response;
      const result = messageService.approveWhatsApp(v.data.ids);
      return NextResponse.json(result);
    }

    const v = validateBody(updateWASchema, body);
    if (!v.success) return v.response;

    const { id, ...updates } = v.data;
    const result = messageService.updateWhatsApp(id, updates);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}

// POST: generate, regenerate, or send WhatsApp message
export async function POST(req: NextRequest) {
  const body = await req.json();

  const v = validateBody(waPostSchema, body);
  if (!v.success) return v.response;

  // Regenerate existing message (matched regenerateWASchema: has messageId, no action)
  if ("messageId" in v.data && !("action" in v.data)) {
    const msg = db.select().from(whatsappMessages).where(eq(whatsappMessages.id, v.data.messageId)).get();
    if (!msg) return NextResponse.json({ error: "Message not found" }, { status: 404 });

    const lead = db.select().from(leads).where(eq(leads.id, msg.leadId)).get();
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

    const analysis: WebAnalysis | null = lead.analysisJson ? JSON.parse(lead.analysisJson) : null;
    const fromName = getSetting("from_name") || getSetting("agency_name") || "ProspectAI";

    const generated = await regenerateWhatsApp(
      lead.name, lead.category, lead.city, lead.website,
      analysis, v.data.tone || msg.tone, fromName,
      msg.body, v.data.instructions || "",
      detectCountryFromPhone(lead.phone) || undefined
    );

    db.update(whatsappMessages).set({
      body: generated.message,
      tone: v.data.tone || msg.tone,
      status: "draft",
      updatedAt: new Date().toISOString(),
    }).where(eq(whatsappMessages.id, msg.id)).run();

    return NextResponse.json({ success: true });
  }

  // Generate new message for a lead
  if ("leadId" in v.data && "action" in v.data && v.data.action === "generate") {
    const lead = db.select().from(leads).where(eq(leads.id, v.data.leadId)).get();
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    if (!lead.phone) return NextResponse.json({ error: "Lead has no phone number" }, { status: 400 });

    const analysis: WebAnalysis | null = lead.analysisJson ? JSON.parse(lead.analysisJson) : null;
    const campaign = lead.campaignId
      ? db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).get()
      : null;

    const tone = v.data.tone || campaign?.defaultTone || getSetting("default_tone") || "professional";
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
      messageKey: "activityLog.waGeneratedFor",
      messageVars: { name: lead.name },
    });

    return NextResponse.json({ success: true });
  }

  // Create manual message for a lead
  if ("leadId" in v.data && "action" in v.data && v.data.action === "manual") {
    const lead = db.select().from(leads).where(eq(leads.id, v.data.leadId)).get();
    if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });
    if (!lead.phone) return NextResponse.json({ error: "Lead has no phone number" }, { status: 400 });

    db.insert(whatsappMessages).values({
      leadId: lead.id,
      campaignId: lead.campaignId,
      toPhone: lead.phone,
      body: v.data.body,
      tone: v.data.tone || "professional",
      status: "draft",
    }).run();

    db.update(leads).set({ status: "wa_generated" }).where(eq(leads.id, lead.id)).run();

    return NextResponse.json({ success: true });
  }

  // Send approved message
  if ("messageId" in v.data && "action" in v.data && v.data.action === "send") {
    const msg = db.select().from(whatsappMessages).where(eq(whatsappMessages.id, v.data.messageId)).get();
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
        messageKey: "activityLog.waSentTo",
        messageVars: { phone: msg.toPhone },
      });

      return NextResponse.json({ success: true });
    } else {
      db.update(whatsappMessages).set({
        status: "failed",
        updatedAt: new Date().toISOString(),
      }).where(eq(whatsappMessages.id, msg.id)).run();

      logActivity("wa_failed", `Error enviando WhatsApp a ${msg.toPhone}: ${result.error}`, {
        leadId: msg.leadId,
        messageKey: "activityLog.errorSendingWa",
        messageVars: { phone: msg.toPhone },
      });

      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
  }

  return NextResponse.json({ error: "Invalid request" }, { status: 400 });
}
