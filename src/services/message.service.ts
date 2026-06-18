import { db } from "@/db";
import { emails, leads, whatsappMessages } from "@/db/schema";
import { eq, and, desc } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { NotFoundError } from "./errors";

// ─── Types ──────────────────────────────────────────────────────────

export interface EmailFilters {
  status?: string;
  campaignId?: number;
  page?: number;
  limit?: number;
}

export interface EmailUpdate {
  subject?: string;
  bodyHtml?: string;
  bodyText?: string;
  status?: string;
}

export interface WhatsAppFilters {
  status?: string;
  limit?: number;
}

export interface WhatsAppUpdate {
  body?: string;
  status?: string;
}

// ─── Email Functions ────────────────────────────────────────────────

export function listEmails(filters: EmailFilters = {}) {
  const { status, campaignId, page = 1, limit = 20 } = filters;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (status) conditions.push(eq(emails.status, status as "draft" | "approved" | "rejected" | "sent" | "failed" | "held"));
  if (campaignId) conditions.push(eq(emails.campaignId, campaignId));

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

  return { emails: rows, page, limit };
}

export function approveEmails(ids: number[]) {
  for (const id of ids) {
    db.update(emails)
      .set({ status: "approved", updatedAt: new Date().toISOString() })
      .where(eq(emails.id, id))
      .run();

    const email = db.select().from(emails).where(eq(emails.id, id)).get();
    if (email) {
      db.update(leads).set({ status: "email_approved" }).where(eq(leads.id, email.leadId)).run();
      logActivity("email_approved", `Email aprobado para lead`, {
        leadId: email.leadId,
        campaignId: email.campaignId ?? undefined,
        messageKey: "activityLog.emailApprovedForLead",
        messageVars: { id: email.leadId },
      });
    }
  }

  return { success: true, count: ids.length };
}

export function updateEmail(id: number, updates: EmailUpdate) {
  const setData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (updates.subject !== undefined) setData.subject = updates.subject;
  if (updates.bodyHtml !== undefined) setData.bodyHtml = updates.bodyHtml;
  if (updates.bodyText !== undefined) setData.bodyText = updates.bodyText;
  if (updates.status !== undefined) setData.status = updates.status;

  const result = db.update(emails).set(setData).where(eq(emails.id, id)).returning().get();
  if (!result) throw new NotFoundError("Email", id);

  // Sync lead status on approve/reject
  if (updates.status === "approved") {
    db.update(leads).set({ status: "email_approved" }).where(eq(leads.id, result.leadId)).run();
    logActivity("email_approved", `Email aprobado`, {
      leadId: result.leadId,
      campaignId: result.campaignId ?? undefined,
      messageKey: "activityLog.emailApproved",
    });
  } else if (updates.status === "rejected") {
    db.update(leads).set({ status: "rejected" }).where(eq(leads.id, result.leadId)).run();
    logActivity("email_rejected", `Email rechazado`, {
      leadId: result.leadId,
      campaignId: result.campaignId ?? undefined,
      messageKey: "activityLog.emailRejected",
    });
  }

  return result;
}

// ─── WhatsApp Functions ─────────────────────────────────────────────

export function listWhatsAppMessages(filters: WhatsAppFilters = {}) {
  const { status = "draft", limit = 100 } = filters;

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
    .where(eq(whatsappMessages.status, status as "draft" | "approved" | "rejected" | "sent" | "failed" | "held"))
    .orderBy(desc(whatsappMessages.createdAt))
    .limit(limit)
    .all();

  return { messages };
}

export function approveWhatsApp(ids: number[]) {
  for (const id of ids) {
    db.update(whatsappMessages)
      .set({ status: "approved", updatedAt: new Date().toISOString() })
      .where(eq(whatsappMessages.id, id))
      .run();
  }

  return { success: true, count: ids.length };
}

export function updateWhatsApp(id: number, updates: WhatsAppUpdate) {
  const setData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (updates.body !== undefined) setData.body = updates.body;
  if (updates.status !== undefined) setData.status = updates.status;

  db.update(whatsappMessages).set(setData).where(eq(whatsappMessages.id, id)).run();

  // Sync lead status on approve/reject
  if (updates.status === "approved" || updates.status === "rejected") {
    const msg = db.select().from(whatsappMessages).where(eq(whatsappMessages.id, id)).get();
    if (!msg) throw new NotFoundError("WhatsApp message", id);

    const leadStatus = updates.status === "approved" ? "wa_approved" : "rejected";
    db.update(leads).set({ status: leadStatus }).where(eq(leads.id, msg.leadId)).run();
    logActivity(
      updates.status === "approved" ? "wa_approved" : "wa_rejected",
      `WhatsApp ${updates.status === "approved" ? "aprobado" : "rechazado"} para lead #${msg.leadId}`,
      {
        leadId: msg.leadId,
        campaignId: msg.campaignId ?? undefined,
        messageKey: updates.status === "approved" ? "activityLog.waApproved" : "activityLog.waRejected",
      }
    );
  }

  return { success: true };
}
