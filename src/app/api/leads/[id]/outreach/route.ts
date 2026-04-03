import { NextRequest, NextResponse } from "next/server";
import { db, getSetting } from "@/db";
import { leads, emails, whatsappMessages, campaigns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { scrapeWebsite } from "@/lib/scraper";
import { analyzeWebsite, generateEmail, generateWhatsApp, detectCountryFromPhone } from "@/lib/gemini";
import type { WebAnalysis } from "@/lib/gemini";
import { calculateOpportunityScore } from "@/lib/scorer";
import { logActivity } from "@/lib/activity";

// POST: trigger individual outreach flow for a lead
// Actions: "analyze" | "generate_email" | "generate_wa" | "create_email" | "create_wa"
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const leadId = Number(id);
  const body = await req.json();
  const action = body.action as string;

  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) return NextResponse.json({ error: "Lead not found" }, { status: 404 });

  // Analyze: scrape website + analyze with Gemini + score
  if (action === "analyze") {
    if (!lead.website) {
      // No website - set scores directly
      db.update(leads).set({
        status: "analyzed",
        webQualityScore: 0,
        opportunityScore: calculateOpportunityScore({
          website: null,
          webQualityScore: 0,
          reviewCount: lead.reviewCount,
          rating: lead.rating,
          category: lead.category,
          email: lead.email,
          extractedEmail: lead.extractedEmail,
        }, {
          hasWebsite: false, qualityScore: 0, issues: ["No tiene sitio web"],
          strengths: [], summary: "El negocio no tiene sitio web",
          isMobile: false, hasSSL: false, loadSpeed: "unknown",
          designScore: 0, contentScore: 0, functionalityScore: 0, extractedEmails: [],
          seoScore: 0, seoIssues: ["No tiene sitio web"],
          googleBusinessOpportunities: ["Crear ficha de Google Business"],
          socialMediaPresence: [], aiAgentOpportunities: ["Chatbot de atención al cliente"],
          recommendedServices: ["web_development"],
        }),
        analysisSummary: "El negocio no tiene sitio web. Gran oportunidad de venta.",
        analysisJson: JSON.stringify({
          hasWebsite: false, qualityScore: 0, issues: ["No tiene sitio web"],
          strengths: [], summary: "El negocio no tiene sitio web",
          isMobile: false, hasSSL: false, loadSpeed: "unknown",
          designScore: 0, contentScore: 0, functionalityScore: 0, extractedEmails: [],
          seoScore: 0, seoIssues: ["No tiene sitio web"],
          googleBusinessOpportunities: ["Crear ficha de Google Business"],
          socialMediaPresence: [], aiAgentOpportunities: ["Chatbot de atención al cliente"],
          recommendedServices: ["web_development"],
        }),
        analyzedAt: new Date().toISOString(),
      }).where(eq(leads.id, leadId)).run();

      logActivity("analyze", `Analizado (sin web): ${lead.name}`, { leadId });
      const updated = db.select().from(leads).where(eq(leads.id, leadId)).get();
      return NextResponse.json({ success: true, lead: updated });
    }

    try {
      db.update(leads).set({ status: "scraping" }).where(eq(leads.id, leadId)).run();

      const result = await scrapeWebsite(lead.website);
      if (!result.success) throw new Error(result.error || "Scrape failed");

      // Save extracted emails
      if (result.emails && result.emails.length > 0) {
        db.update(leads).set({
          extractedEmail: result.emails[0],
          contactEmail: lead.contactEmail || lead.email ? undefined : result.emails[0],
          scrapedAt: new Date().toISOString(),
        }).where(eq(leads.id, leadId)).run();
      }

      db.update(leads).set({ status: "analyzing" }).where(eq(leads.id, leadId)).run();

      const analysis = await analyzeWebsite(
        lead.name, lead.category, lead.website, result.content || "", result.meta || {}
      );

      const updatedLead = db.select().from(leads).where(eq(leads.id, leadId)).get()!;
      const opportunityScore = calculateOpportunityScore({
        website: lead.website,
        webQualityScore: analysis.qualityScore,
        reviewCount: lead.reviewCount,
        rating: lead.rating,
        category: lead.category,
        email: lead.email,
        extractedEmail: updatedLead.extractedEmail,
      }, analysis);

      db.update(leads).set({
        status: "analyzed",
        webQualityScore: analysis.qualityScore,
        opportunityScore,
        analysisJson: JSON.stringify(analysis),
        analysisSummary: analysis.summary,
        analyzedAt: new Date().toISOString(),
        extractedEmail: analysis.extractedEmails?.[0] || updatedLead.extractedEmail,
      }).where(eq(leads.id, leadId)).run();

      logActivity("scrape", `Analizado individualmente: ${lead.name} (calidad: ${analysis.qualityScore}/100)`, { leadId });

      const final = db.select().from(leads).where(eq(leads.id, leadId)).get();
      return NextResponse.json({ success: true, lead: final });
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : "Unknown error";
      db.update(leads).set({ status: "error", errorMessage: errorMsg }).where(eq(leads.id, leadId)).run();
      return NextResponse.json({ success: false, error: errorMsg }, { status: 500 });
    }
  }

  // Generate email with AI
  if (action === "generate_email") {
    const toEmail = lead.contactEmail || lead.extractedEmail || lead.email;
    if (!toEmail) return NextResponse.json({ error: "No email available" }, { status: 400 });

    const analysis: WebAnalysis | null = lead.analysisJson ? JSON.parse(lead.analysisJson) : null;
    if (!analysis) return NextResponse.json({ error: "Lead not analyzed yet" }, { status: 400 });

    const campaign = lead.campaignId
      ? db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).get()
      : null;

    const tone = body.tone || campaign?.defaultTone || getSetting("default_tone") || "profesional";
    const fromName = getSetting("from_name") || "VanguardIA";
    const fromEmail = getSetting("from_email") || "hola@vanguardia.dev";

    const generated = await generateEmail(lead.name, lead.category, lead.city, lead.website, analysis, tone, fromName, undefined, undefined, detectCountryFromPhone(lead.phone) || undefined);

    db.insert(emails).values({
      leadId: lead.id,
      campaignId: lead.campaignId,
      toEmail,
      fromEmail,
      subject: generated.subject,
      bodyHtml: generated.bodyHtml,
      bodyText: generated.bodyText,
      tone,
      status: "draft",
    }).run();

    db.update(leads).set({ status: "email_generated" }).where(eq(leads.id, leadId)).run();
    logActivity("email_generated", `Email generado individualmente para ${lead.name}`, { leadId });
    return NextResponse.json({ success: true });
  }

  // Generate WhatsApp with AI
  if (action === "generate_wa") {
    if (!lead.phone) return NextResponse.json({ error: "No phone available" }, { status: 400 });

    const analysis: WebAnalysis | null = lead.analysisJson ? JSON.parse(lead.analysisJson) : null;
    const campaign = lead.campaignId
      ? db.select().from(campaigns).where(eq(campaigns.id, lead.campaignId)).get()
      : null;

    const tone = body.tone || campaign?.defaultTone || getSetting("default_tone") || "profesional";
    const fromName = getSetting("from_name") || "VanguardIA";

    const generated = await generateWhatsApp(lead.name, lead.category, lead.city, lead.website, analysis, tone, fromName, undefined, undefined, detectCountryFromPhone(lead.phone) || undefined);

    db.insert(whatsappMessages).values({
      leadId: lead.id,
      campaignId: lead.campaignId,
      toPhone: lead.phone,
      body: generated.message,
      tone,
      status: "draft",
    }).run();

    db.update(leads).set({ status: "wa_generated" }).where(eq(leads.id, leadId)).run();
    logActivity("wa_generated", `WhatsApp generado individualmente para ${lead.name}`, { leadId });
    return NextResponse.json({ success: true });
  }

  // Create manual email draft
  if (action === "create_email") {
    const toEmail = lead.contactEmail || lead.extractedEmail || lead.email;
    if (!toEmail) return NextResponse.json({ error: "No email available" }, { status: 400 });

    const fromEmail = getSetting("from_email") || "hola@vanguardia.dev";

    db.insert(emails).values({
      leadId: lead.id,
      campaignId: lead.campaignId,
      toEmail,
      fromEmail,
      subject: body.subject || "",
      bodyHtml: body.bodyHtml || `<p>${(body.bodyText || "").replace(/\n/g, "</p><p>")}</p>`,
      bodyText: body.bodyText || "",
      tone: body.tone || "profesional",
      status: "draft",
    }).run();

    db.update(leads).set({ status: "email_generated" }).where(eq(leads.id, leadId)).run();
    return NextResponse.json({ success: true });
  }

  // Create manual WhatsApp draft
  if (action === "create_wa") {
    if (!lead.phone) return NextResponse.json({ error: "No phone available" }, { status: 400 });

    db.insert(whatsappMessages).values({
      leadId: lead.id,
      campaignId: lead.campaignId,
      toPhone: lead.phone,
      body: body.body || "",
      tone: body.tone || "profesional",
      status: "draft",
    }).run();

    db.update(leads).set({ status: "wa_generated" }).where(eq(leads.id, leadId)).run();
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
