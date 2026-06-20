import { db } from "@/db";
import { leads, emails, whatsappMessages, activityLog } from "@/db/schema";
import { eq, and, desc, like, lte, sql, inArray } from "drizzle-orm";
import { NotFoundError } from "./errors";
import { findPriorContacts } from "@/lib/contact-history";

// ─── Types ──────────────────────────────────────────────────────────

export interface SearchLeadsFilters {
  campaignId?: number;
  city?: string;
  status?: string;
  source?: string;
  tags?: string;
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
  tags?: string[];
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
  if (filters.source) conditions.push(eq(leads.source, filters.source));
  // tags is a JSON array string (e.g. ["dermatólogo","CDMX"]); match the quoted
  // token so "CDMX" doesn't also match a hypothetical "CDMX Norte".
  if (filters.tags) conditions.push(like(leads.tags, `%"${filters.tags}"%`));
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

/** Distinct values for the /leads filter dropdowns: cities, sources, and tags. */
export function getLeadFacets() {
  const cities = db.selectDistinct({ city: leads.city }).from(leads).all()
    .map((r) => r.city).filter(Boolean) as string[];
  const sources = db.selectDistinct({ source: leads.source }).from(leads).all()
    .map((r) => r.source).filter(Boolean) as string[];
  const tagRows = db.select({ tags: leads.tags }).from(leads)
    .where(sql`${leads.tags} is not null`).all();
  const tagSet = new Set<string>();
  for (const r of tagRows) {
    try {
      const arr = JSON.parse(r.tags as string);
      if (Array.isArray(arr)) arr.forEach((t) => tagSet.add(String(t)));
    } catch { /* ignore malformed tag json */ }
  }
  return { cities, sources, tags: [...tagSet].sort() };
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

  // Cross-campaign contact history: was this same company already contacted via
  // another lead/campaign, and where (drives the "ya contactado" panel).
  const priorContacts = findPriorContacts(id);

  return { lead, emails: leadEmails, whatsapps: leadWhatsapps, activity, priorContacts };
}

export function updateLead(id: number, updates: UpdateLeadInput) {
  const cleanUpdates: Record<string, unknown> = {};
  if (updates.contactEmail !== undefined) cleanUpdates.contactEmail = updates.contactEmail;
  if (updates.notes !== undefined) cleanUpdates.notes = updates.notes;
  if (updates.status !== undefined) cleanUpdates.status = updates.status;
  if (updates.campaignId !== undefined) cleanUpdates.campaignId = updates.campaignId;
  if (updates.tags !== undefined) cleanUpdates.tags = updates.tags.length ? JSON.stringify(updates.tags) : null;

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
