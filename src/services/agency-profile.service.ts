import { db, getSetting, setSetting } from "@/db";
import { agencyProfile } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity";

export interface AgencyProfileData {
  name?: string | null;
  url?: string | null;
  description?: string | null;
  tagline?: string | null;
  ownerName?: string | null;
  ownerRole?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  services?: string[]; // keys array (parsed)
  customServices?: { label: string; description: string }[];
  city?: string | null;
  country?: string | null;
  valueProps?: string[];
  caseStudies?: { client: string; result: string; snippet?: string }[];
  source?: "url" | "manual" | "skipped";
  sourceUrl?: string | null;
  extractedAt?: string | null;
  completedAt?: string | null;
}

export interface AgencyProfileRow extends AgencyProfileData {
  id: number;
  createdAt: string;
  updatedAt: string;
}

function parseJsonArray<T>(raw: string | null | undefined): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function rowToProfile(row: typeof agencyProfile.$inferSelect): AgencyProfileRow {
  return {
    id: row.id,
    name: row.name,
    url: row.url,
    description: row.description,
    tagline: row.tagline,
    ownerName: row.ownerName,
    ownerRole: row.ownerRole,
    contactEmail: row.contactEmail,
    contactPhone: row.contactPhone,
    services: row.services ? row.services.split(",").map((s) => s.trim()).filter(Boolean) : [],
    customServices: parseJsonArray(row.customServices),
    city: row.city,
    country: row.country,
    valueProps: parseJsonArray(row.valueProps),
    caseStudies: parseJsonArray(row.caseStudies),
    source: row.source as "url" | "manual" | "skipped" | undefined,
    sourceUrl: row.sourceUrl,
    extractedAt: row.extractedAt,
    completedAt: row.completedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function getAgencyProfile(): AgencyProfileRow | null {
  const row = db.select().from(agencyProfile).where(eq(agencyProfile.id, 1)).get();
  return row ? rowToProfile(row) : null;
}

export function isOnboardingComplete(): boolean {
  const profile = getAgencyProfile();
  return Boolean(profile?.completedAt);
}

export function upsertAgencyProfile(data: AgencyProfileData): AgencyProfileRow {
  const existing = db.select().from(agencyProfile).where(eq(agencyProfile.id, 1)).get();
  const nowIso = new Date().toISOString().replace("T", " ").substring(0, 19);

  const values = {
    id: 1,
    name: data.name ?? existing?.name ?? null,
    url: data.url ?? existing?.url ?? null,
    description: data.description ?? existing?.description ?? null,
    tagline: data.tagline ?? existing?.tagline ?? null,
    ownerName: data.ownerName ?? existing?.ownerName ?? null,
    ownerRole: data.ownerRole ?? existing?.ownerRole ?? null,
    contactEmail: data.contactEmail ?? existing?.contactEmail ?? null,
    contactPhone: data.contactPhone ?? existing?.contactPhone ?? null,
    services: data.services !== undefined
      ? data.services.join(",")
      : existing?.services ?? null,
    customServices: data.customServices !== undefined
      ? JSON.stringify(data.customServices)
      : existing?.customServices ?? null,
    city: data.city ?? existing?.city ?? null,
    country: data.country ?? existing?.country ?? null,
    valueProps: data.valueProps !== undefined
      ? JSON.stringify(data.valueProps)
      : existing?.valueProps ?? null,
    caseStudies: data.caseStudies !== undefined
      ? JSON.stringify(data.caseStudies)
      : existing?.caseStudies ?? null,
    source: data.source ?? existing?.source ?? null,
    sourceUrl: data.sourceUrl ?? existing?.sourceUrl ?? null,
    extractedAt: data.extractedAt ?? existing?.extractedAt ?? null,
    completedAt: data.completedAt ?? existing?.completedAt ?? null,
    updatedAt: nowIso,
  };

  if (existing) {
    db.update(agencyProfile).set(values).where(eq(agencyProfile.id, 1)).run();
  } else {
    db.insert(agencyProfile).values(values).run();
  }

  // Mirror key fields to settings table so legacy code (getAgencyContext fallback,
  // service catalog, locale rules) keeps working without breaking.
  if (data.name !== undefined) setSetting("agency_name", data.name ?? "");
  if (data.url !== undefined) setSetting("agency_url", data.url ?? "");
  if (data.description !== undefined) setSetting("agency_description", data.description ?? "");
  if (data.services !== undefined) setSetting("agency_services", data.services.join(","));
  if (data.country !== undefined && data.country) setSetting("target_country", data.country);
  if (data.contactEmail !== undefined && data.contactEmail && !getSetting("from_email")) {
    setSetting("from_email", data.contactEmail);
  }
  if (data.ownerName !== undefined && data.ownerName && !getSetting("from_name")) {
    setSetting("from_name", data.ownerName);
  }

  const updated = db.select().from(agencyProfile).where(eq(agencyProfile.id, 1)).get()!;
  return rowToProfile(updated);
}

export function markOnboardingComplete(source: "url" | "manual" | "skipped" = "manual"): AgencyProfileRow {
  const now = new Date().toISOString();
  const profile = upsertAgencyProfile({
    completedAt: now,
    source,
  });
  logActivity("setting_change", `Onboarding completado (origen: ${source})`, {
    metadata: { source, completedAt: now },
  });
  return profile;
}

export function resetAgencyProfile(): void {
  db.delete(agencyProfile).where(eq(agencyProfile.id, 1)).run();
}
