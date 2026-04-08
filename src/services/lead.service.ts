import { db } from "@/db";
import { leads, emails, whatsappMessages, activityLog } from "@/db/schema";
import { eq, and, desc, like, lte, sql, inArray } from "drizzle-orm";
import { NotFoundError } from "./errors";

// ─── Types ──────────────────────────────────────────────────────────

export interface SearchLeadsFilters {
  campaignId?: number;
  city?: string;
  status?: string;
  maxQuality?: number;
  search?: string;
  page?: number;
  limit?: number;
}

export interface UpdateLeadInput {
  contactEmail?: string;
  notes?: string;
  status?: string;
  campaignId?: number;
}

export interface BulkUpdateInput {
  status?: string;
  campaignId?: number;
}

// ─── Service Functions ──────────────────────────────────────────────

export function searchLeads(filters: SearchLeadsFilters) {
  const page = filters.page ?? 1;
  const limit = filters.limit ?? 50;
  const offset = (page - 1) * limit;

  const conditions = [];
  if (filters.campaignId) conditions.push(eq(leads.campaignId, filters.campaignId));
  if (filters.city) conditions.push(eq(leads.city, filters.city));
  if (filters.status) conditions.push(eq(leads.status, filters.status as typeof leads.status.enumValues[number]));
  if (filters.maxQuality) conditions.push(lte(leads.webQualityScore, filters.maxQuality));
  if (filters.search) conditions.push(like(leads.name, `%${filters.search}%`));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db.select().from(leads)
    .where(where)
    .orderBy(desc(leads.opportunityScore))
    .limit(limit)
    .offset(offset)
    .all();

  const countResult = db.select({ count: sql<number>`count(*)` }).from(leads).where(where).get();
  const total = countResult?.count ?? 0;

  return { leads: rows, total, page, limit };
}

export function getLeadDetails(id: number) {
  const lead = db.select().from(leads).where(eq(leads.id, id)).get();
  if (!lead) throw new NotFoundError("Lead", id);

  const leadEmails = db.select().from(emails)
    .where(eq(emails.leadId, id))
    .orderBy(desc(emails.createdAt))
    .all();

  const leadWhatsapps = db.select().from(whatsappMessages)
    .where(eq(whatsappMessages.leadId, id))
    .orderBy(desc(whatsappMessages.createdAt))
    .all();

  const activity = db.select().from(activityLog)
    .where(eq(activityLog.leadId, id))
    .orderBy(desc(activityLog.createdAt))
    .limit(50)
    .all();

  return { lead, emails: leadEmails, whatsapps: leadWhatsapps, activity };
}

export function updateLead(id: number, updates: UpdateLeadInput) {
  const cleanUpdates: Record<string, unknown> = {};
  if (updates.contactEmail !== undefined) cleanUpdates.contactEmail = updates.contactEmail;
  if (updates.notes !== undefined) cleanUpdates.notes = updates.notes;
  if (updates.status !== undefined) cleanUpdates.status = updates.status;
  if (updates.campaignId !== undefined) cleanUpdates.campaignId = updates.campaignId;

  const result = db.update(leads).set(cleanUpdates).where(eq(leads.id, id)).returning().get();
  if (!result) throw new NotFoundError("Lead", id);

  return result;
}

export function bulkUpdateLeads(ids: number[], updates: BulkUpdateInput) {
  const cleanUpdates: Record<string, unknown> = {};
  if (updates.status !== undefined) cleanUpdates.status = updates.status;
  if (updates.campaignId !== undefined) cleanUpdates.campaignId = updates.campaignId;

  if (Object.keys(cleanUpdates).length === 0) {
    throw new Error("No updates provided");
  }

  db.update(leads).set(cleanUpdates).where(inArray(leads.id, ids)).run();
  return { success: true, updated: ids.length };
}

export function deleteLead(id: number) {
  db.delete(leads).where(eq(leads.id, id)).run();
  return { success: true, deleted: 1 };
}

export function bulkDeleteLeads(ids: number[]) {
  db.delete(leads).where(inArray(leads.id, ids)).run();
  return { success: true, deleted: ids.length };
}
