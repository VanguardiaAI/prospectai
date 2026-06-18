// Cross-campaign contact history.
//
// The same real company can exist as several `leads` rows (e.g. scraped into two
// campaigns). Pitching it twice — different services from the same email/number —
// is an instant credibility hit. This module detects when a lead's company was
// already contacted on ANY channel by another lead, so the send guard can hold it
// and the review UI can warn. Matching is on the destination identity: email
// (well-formed only — scraped emails are noisy), phone (normalized), website domain.

import { db } from "@/db";
import { leads, emails, whatsappMessages, campaigns } from "@/db/schema";
import { eq, ne, and, inArray, sql } from "drizzle-orm";

// Scraped "emails" are often junk (logo-degradado@2x.png). Only treat well-formed
// addresses whose TLD isn't a file extension as real contact emails.
const FILE_EXT = /\.(png|jpe?g|gif|svg|webp|bmp|ico|css|js|json|pdf|mp4|webm|woff2?)$/i;

export function isRealEmail(value?: string | null): boolean {
  if (!value) return false;
  const s = value.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[a-z]{2,}$/.test(s)) return false;
  return !FILE_EXT.test(s);
}

/** Last 10 digits of a phone, or null if too short to be a real number. */
export function normalizePhone(value?: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  return digits.length >= 9 ? digits.slice(-10) : null;
}

/** Bare registrable host (no scheme / www / path), or null. */
export function domainOf(url?: string | null): string | null {
  if (!url) return null;
  const host = url.trim().toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0]
    .trim();
  return host || null;
}

type Lead = typeof leads.$inferSelect;
type MatchKey = "email" | "phone" | "domain";

function leadRealEmails(lead: Pick<Lead, "contactEmail" | "extractedEmail" | "email">): string[] {
  return [lead.contactEmail, lead.extractedEmail, lead.email]
    .filter(isRealEmail)
    .map((e) => (e as string).toLowerCase());
}

export interface PriorContact {
  channel: "email" | "whatsapp";
  leadId: number;
  campaignId: number | null;
  campaignName: string | null;
  strategy: string | null;     // web_design | seo_visibility — the "service" pitched
  status: string;              // sent | approved | held | draft
  sentAt: string | null;
  recipient: string;           // the email / phone the prior message went to
  matchedOn: MatchKey;         // why we think it's the same company
}

// Other leads that look like the SAME company as `lead`.
function siblingLeads(lead: Lead): Map<number, MatchKey> {
  const out = new Map<number, MatchKey>();
  const myEmails = leadRealEmails(lead);
  const myPhone = normalizePhone(lead.phone);
  const myDomain = domainOf(lead.website);

  // Email / domain: scan once (datasets are small, single-user tool).
  if (myEmails.length || myDomain) {
    const rows = db.select({
      id: leads.id, contactEmail: leads.contactEmail, extractedEmail: leads.extractedEmail,
      email: leads.email, website: leads.website,
    }).from(leads).where(ne(leads.id, lead.id)).all();

    for (const r of rows) {
      if (myEmails.length && leadRealEmails(r).some((e) => myEmails.includes(e))) {
        out.set(r.id, "email");
        continue;
      }
      if (myDomain && domainOf(r.website) === myDomain && !out.has(r.id)) {
        out.set(r.id, "domain");
      }
    }
  }

  // Phone: matched in SQL on the last 10 digits.
  if (myPhone) {
    const rows = db.select({ id: leads.id }).from(leads).where(and(
      ne(leads.id, lead.id),
      sql`replace(replace(replace(replace(coalesce(${leads.phone},''),' ',''),'-',''),'+',''),'(','') LIKE '%' || ${myPhone}`,
    )).all();
    for (const r of rows) if (!out.has(r.id)) out.set(r.id, "phone");
  }

  return out;
}

/**
 * Prior outreach to the same company as `leadId`, from OTHER leads. Includes
 * pending messages by default; pass `onlySent` for the credibility-critical set
 * (messages actually delivered) that drives the send guard.
 */
export function findPriorContacts(leadId: number, opts: { onlySent?: boolean } = {}): PriorContact[] {
  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) return [];

  const sibs = siblingLeads(lead);
  if (sibs.size === 0) return [];

  const ids = [...sibs.keys()];
  const statuses = (opts.onlySent ? ["sent"] : ["sent", "approved", "held", "draft"]) as Array<"sent" | "approved" | "held" | "draft">;
  const result: PriorContact[] = [];

  const emailRows = db.select({ m: emails, campaignName: campaigns.name, strategy: campaigns.strategy })
    .from(emails).leftJoin(campaigns, eq(emails.campaignId, campaigns.id))
    .where(and(inArray(emails.leadId, ids), inArray(emails.status, statuses))).all();
  for (const r of emailRows) {
    result.push({
      channel: "email", leadId: r.m.leadId, campaignId: r.m.campaignId,
      campaignName: r.campaignName ?? null, strategy: r.strategy ?? null,
      status: r.m.status, sentAt: r.m.sentAt, recipient: r.m.toEmail,
      matchedOn: sibs.get(r.m.leadId)!,
    });
  }

  const waRows = db.select({ m: whatsappMessages, campaignName: campaigns.name, strategy: campaigns.strategy })
    .from(whatsappMessages).leftJoin(campaigns, eq(whatsappMessages.campaignId, campaigns.id))
    .where(and(inArray(whatsappMessages.leadId, ids), inArray(whatsappMessages.status, statuses))).all();
  for (const r of waRows) {
    result.push({
      channel: "whatsapp", leadId: r.m.leadId, campaignId: r.m.campaignId,
      campaignName: r.campaignName ?? null, strategy: r.strategy ?? null,
      status: r.m.status, sentAt: r.m.sentAt, recipient: r.m.toPhone,
      matchedOn: sibs.get(r.m.leadId)!,
    });
  }

  // Sent first, then most recent.
  result.sort((a, b) => {
    if ((a.status === "sent") !== (b.status === "sent")) return a.status === "sent" ? -1 : 1;
    return (b.sentAt ?? "") < (a.sentAt ?? "") ? -1 : 1;
  });
  return result;
}

/** True if this company already received a delivered message via another lead. */
export function wasCompanyContacted(leadId: number): boolean {
  return findPriorContacts(leadId, { onlySent: true }).length > 0;
}
