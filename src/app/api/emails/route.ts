import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { emails, leads } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { regenerateEmail, detectCountryFromPhone } from "@/lib/gemini";
import type { WebAnalysis } from "@/lib/gemini";
import { getSetting } from "@/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const campaignId = searchParams.get("campaignId");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "20");
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) conditions.push(eq(emails.status, status as "draft" | "approved" | "rejected" | "sent" | "failed"));
  if (campaignId) conditions.push(eq(emails.campaignId, Number(campaignId)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db.select({
    email: emails,
    leadName: leads.name,
    leadCategory: leads.category,
    leadCity: leads.city,
    leadWebsite: leads.website,
    leadScore: leads.webQualityScore,
    leadOpportunity: leads.opportunityScore,
    leadAnalysisSummary: leads.analysisSummary,
  })
    .from(emails)
    .leftJoin(leads, eq(emails.leadId, leads.id))
    .where(where)
    .orderBy(desc(emails.createdAt))
    .limit(limit)
    .offset(offset)
    .all();

  return NextResponse.json({ emails: rows, page, limit });
}

export async function PUT(req: NextRequest) {
  const body = await req.json();

  // Bulk approve
  if (body.bulkApprove && Array.isArray(body.ids)) {
    for (const id of body.ids) {
      db.update(emails).set({ status: "approved", updatedAt: new Date().toISOString() }).where(eq(emails.id, id)).run();
      const email = db.select().from(emails).where(eq(emails.id, id)).get();
      if (email) {
        db.update(leads).set({ status: "email_approved" }).where(eq(leads.id, email.leadId)).run();
        logActivity("email_approved", `Email aprobado para lead`, { leadId: email.leadId, campaignId: email.campaignId ?? undefined });
      }
    }
    return NextResponse.json({ success: true, count: body.ids.length });
  }

  // Single email update
  if (!body.id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (body.subject !== undefined) updates.subject = body.subject;
  if (body.bodyHtml !== undefined) updates.bodyHtml = body.bodyHtml;
  if (body.bodyText !== undefined) updates.bodyText = body.bodyText;
  if (body.status !== undefined) updates.status = body.status;

  const result = db.update(emails).set(updates).where(eq(emails.id, body.id)).returning().get();

  // Update lead status
  if (body.status === "approved") {
    db.update(leads).set({ status: "email_approved" }).where(eq(leads.id, result.leadId)).run();
    logActivity("email_approved", `Email aprobado`, { leadId: result.leadId, campaignId: result.campaignId ?? undefined });
  } else if (body.status === "rejected") {
    db.update(leads).set({ status: "rejected" }).where(eq(leads.id, result.leadId)).run();
    logActivity("email_rejected", `Email rechazado`, { leadId: result.leadId, campaignId: result.campaignId ?? undefined });
  }

  return NextResponse.json(result);
}

// Regenerate email with different tone
export async function POST(req: NextRequest) {
  const body = await req.json();

  if (!body.emailId) return NextResponse.json({ error: "emailId required" }, { status: 400 });

  const existingEmail = db.select().from(emails).where(eq(emails.id, body.emailId)).get();
  if (!existingEmail) return NextResponse.json({ error: "Email not found" }, { status: 404 });

  const lead = db.select().from(leads).where(eq(leads.id, existingEmail.leadId)).get();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const analysis: WebAnalysis = lead.analysisJson ? JSON.parse(lead.analysisJson) : {
    hasWebsite: !!lead.website,
    qualityScore: lead.webQualityScore || 0,
    issues: [],
    strengths: [],
    summary: lead.analysisSummary || "",
    isMobile: false,
    hasSSL: false,
    loadSpeed: "unknown" as const,
    designScore: 0,
    contentScore: 0,
    functionalityScore: 0,
    extractedEmails: [],
  };

  const tone = body.tone || existingEmail.tone;
  const fromName = getSetting("from_name") || getSetting("agency_name") || "ProspectAI";

  const generated = await regenerateEmail(
    lead.name,
    lead.category,
    lead.city,
    lead.website,
    analysis,
    tone,
    fromName,
    existingEmail.subject,
    existingEmail.bodyText,
    body.instructions || "",
    detectCountryFromPhone(lead.phone) || undefined
  );

  const updated = db.update(emails).set({
    subject: generated.subject,
    bodyHtml: generated.bodyHtml,
    bodyText: generated.bodyText,
    tone,
    status: "draft",
    updatedAt: new Date().toISOString(),
  }).where(eq(emails.id, body.emailId)).returning().get();

  return NextResponse.json(updated);
}
