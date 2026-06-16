import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { emails, leads, campaigns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { regenerateEmail, detectCountryFromPhone } from "@/lib/gemini";
import type { WebAnalysis } from "@/lib/gemini";
import { getSetting } from "@/db";
import { validateBody, bulkApproveEmailsSchema, updateEmailSchema, regenerateEmailSchema } from "@/lib/validations";
import * as messageService from "@/services/message.service";
import { handleServiceError } from "@/services/api-handler";
import { withStrategyDirective } from "@/lib/ai/strategy";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const data = messageService.listEmails({
      status: searchParams.get("status") || undefined,
      campaignId: searchParams.get("campaignId") ? Number(searchParams.get("campaignId")) : undefined,
      page: parseInt(searchParams.get("page") || "1"),
      limit: parseInt(searchParams.get("limit") || "20"),
    });
    return NextResponse.json(data);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json();

  try {
    // Bulk approve
    if (body.bulkApprove) {
      const v = validateBody(bulkApproveEmailsSchema, body);
      if (!v.success) return v.response;
      const result = messageService.approveEmails(v.data.ids);
      return NextResponse.json(result);
    }

    // Single email update
    const v = validateBody(updateEmailSchema, body);
    if (!v.success) return v.response;

    const { id, ...updates } = v.data;
    const result = messageService.updateEmail(id, updates);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}

// Regenerate email with different tone
export async function POST(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(regenerateEmailSchema, body);
  if (!v.success) return v.response;

  const existingEmail = db.select().from(emails).where(eq(emails.id, v.data.emailId)).get();
  if (!existingEmail) return NextResponse.json({ error: "Email not found" }, { status: 404 });

  const lead = db.select().from(leads).where(eq(leads.id, existingEmail.leadId)).get();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  const campaign = lead.campaignId ? db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).get() : null;

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

  const tone = v.data.tone || existingEmail.tone;
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
    withStrategyDirective(campaign?.strategy, v.data.instructions) || "",
    detectCountryFromPhone(lead.phone) || undefined
  );

  const updated = db.update(emails).set({
    subject: generated.subject,
    bodyHtml: generated.bodyHtml,
    bodyText: generated.bodyText,
    tone,
    status: "draft",
    updatedAt: new Date().toISOString(),
  }).where(eq(emails.id, v.data.emailId)).returning().get();

  return NextResponse.json(updated);
}
