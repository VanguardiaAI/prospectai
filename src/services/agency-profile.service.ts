import { db, getSetting, setSetting } from "@/db";
import { agencyProfile, campaigns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { ValidationError, NotFoundError } from "./errors";

export type CampaignStrategy = "web_design" | "seo_visibility";

export interface AgencyProfileData {
  label?: string | null;
  strategy?: CampaignStrategy;
  isDefault?: boolean;
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
  label: string | null;
  strategy: CampaignStrategy;
  isDefault: boolean;
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
    label: row.label,
    strategy: (row.strategy as CampaignStrategy) ?? "web_design",
    isDefault: Boolean(row.isDefault),
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

function nowIso(): string {
  return new Date().toISOString().replace("T", " ").substring(0, 19);
}

/** Build the column values for an insert/update, falling back to `existing` for omitted fields. */
function buildProfileValues(
  data: AgencyProfileData,
  existing?: typeof agencyProfile.$inferSelect,
): Partial<typeof agencyProfile.$inferInsert> {
  return {
    label: data.label !== undefined ? data.label : existing?.label ?? null,
    strategy: data.strategy ?? (existing?.strategy as CampaignStrategy | undefined) ?? "web_design",
    name: data.name !== undefined ? data.name : existing?.name ?? null,
    url: data.url !== undefined ? data.url : existing?.url ?? null,
    description: data.description !== undefined ? data.description : existing?.description ?? null,
    tagline: data.tagline !== undefined ? data.tagline : existing?.tagline ?? null,
    ownerName: data.ownerName !== undefined ? data.ownerName : existing?.ownerName ?? null,
    ownerRole: data.ownerRole !== undefined ? data.ownerRole : existing?.ownerRole ?? null,
    contactEmail: data.contactEmail !== undefined ? data.contactEmail : existing?.contactEmail ?? null,
    contactPhone: data.contactPhone !== undefined ? data.contactPhone : existing?.contactPhone ?? null,
    services: data.services !== undefined ? data.services.join(",") : existing?.services ?? null,
    customServices: data.customServices !== undefined
      ? JSON.stringify(data.customServices)
      : existing?.customServices ?? null,
    city: data.city !== undefined ? data.city : existing?.city ?? null,
    country: data.country !== undefined ? data.country : existing?.country ?? null,
    valueProps: data.valueProps !== undefined ? JSON.stringify(data.valueProps) : existing?.valueProps ?? null,
    caseStudies: data.caseStudies !== undefined ? JSON.stringify(data.caseStudies) : existing?.caseStudies ?? null,
    source: data.source ?? existing?.source ?? null,
    sourceUrl: data.sourceUrl !== undefined ? data.sourceUrl : existing?.sourceUrl ?? null,
    extractedAt: data.extractedAt !== undefined ? data.extractedAt : existing?.extractedAt ?? null,
    completedAt: data.completedAt !== undefined ? data.completedAt : existing?.completedAt ?? null,
    updatedAt: nowIso(),
  };
}

/**
 * Mirror key identity fields to the settings table so legacy code (getAgencyContext
 * fallback, global service catalog, locale rules, sending defaults) keeps working.
 * Only called for writes to the DEFAULT profile, so secondary profiles never clobber globals.
 */
function mirrorProfileToSettings(data: AgencyProfileData): void {
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
}

function clearDefaults(exceptId?: number): void {
  const rows = db.select({ id: agencyProfile.id }).from(agencyProfile).all();
  for (const row of rows) {
    if (row.id !== exceptId) {
      db.update(agencyProfile).set({ isDefault: false }).where(eq(agencyProfile.id, row.id)).run();
    }
  }
}

// ─── Reads ──────────────────────────────────────────────────────────

export function listAgencyProfiles(): AgencyProfileRow[] {
  const rows = db.select().from(agencyProfile).orderBy(agencyProfile.id).all();
  return rows.map(rowToProfile);
}

export function getAgencyProfileById(id: number): AgencyProfileRow | null {
  const row = db.select().from(agencyProfile).where(eq(agencyProfile.id, id)).get();
  return row ? rowToProfile(row) : null;
}

/** The default profile, or the lowest-id profile as a fallback, or null if none exist. */
export function getDefaultAgencyProfile(): AgencyProfileRow | null {
  const flagged = db.select().from(agencyProfile).where(eq(agencyProfile.isDefault, true)).get();
  if (flagged) return rowToProfile(flagged);
  const first = db.select().from(agencyProfile).orderBy(agencyProfile.id).get();
  return first ? rowToProfile(first) : null;
}

/** Backwards-compatible accessor: returns the default profile. */
export function getAgencyProfile(): AgencyProfileRow | null {
  return getDefaultAgencyProfile();
}

export function isOnboardingComplete(): boolean {
  return Boolean(getDefaultAgencyProfile()?.completedAt);
}

// ─── Writes ─────────────────────────────────────────────────────────

export function createAgencyProfile(data: AgencyProfileData): AgencyProfileRow {
  const count = db.select({ id: agencyProfile.id }).from(agencyProfile).all().length;
  const shouldBeDefault = data.isDefault === true || count === 0;

  const values = buildProfileValues(data);
  const inserted = db
    .insert(agencyProfile)
    .values({ ...values, isDefault: shouldBeDefault })
    .returning()
    .get();

  if (shouldBeDefault) {
    clearDefaults(inserted.id);
    mirrorProfileToSettings(data);
  }

  logActivity("setting_change", `Perfil de agencia "${inserted.label || inserted.name || inserted.id}" creado`, {
    metadata: { profileId: inserted.id },
  });
  return rowToProfile(inserted);
}

export function updateAgencyProfile(id: number, data: AgencyProfileData): AgencyProfileRow {
  const existing = db.select().from(agencyProfile).where(eq(agencyProfile.id, id)).get();
  if (!existing) throw new NotFoundError("AgencyProfile", id);

  const values = buildProfileValues(data, existing);
  db.update(agencyProfile).set(values).where(eq(agencyProfile.id, id)).run();

  // Promote to default if requested
  if (data.isDefault === true && !existing.isDefault) {
    clearDefaults(id);
    db.update(agencyProfile).set({ isDefault: true }).where(eq(agencyProfile.id, id)).run();
  }

  const updated = db.select().from(agencyProfile).where(eq(agencyProfile.id, id)).get()!;
  // Re-mirror the FULL default profile (not just the partial `data`) so legacy settings
  // stay in sync whether this was a field edit or a set-default promotion.
  if (updated.isDefault) mirrorProfileToSettings(rowToProfile(updated));

  return rowToProfile(updated);
}

export function setDefaultAgencyProfile(id: number): AgencyProfileRow {
  const existing = db.select().from(agencyProfile).where(eq(agencyProfile.id, id)).get();
  if (!existing) throw new NotFoundError("AgencyProfile", id);

  clearDefaults(id);
  db.update(agencyProfile).set({ isDefault: true }).where(eq(agencyProfile.id, id)).run();

  const updated = db.select().from(agencyProfile).where(eq(agencyProfile.id, id)).get()!;
  // Re-mirror this profile's identity to the global settings now that it's the default.
  mirrorProfileToSettings(rowToProfile(updated));
  logActivity("setting_change", `Perfil "${updated.label || updated.name || id}" marcado por defecto`, {
    metadata: { profileId: id },
  });
  return rowToProfile(updated);
}

export function deleteAgencyProfile(id: number): void {
  const existing = db.select().from(agencyProfile).where(eq(agencyProfile.id, id)).get();
  if (!existing) throw new NotFoundError("AgencyProfile", id);

  const total = db.select({ id: agencyProfile.id }).from(agencyProfile).all().length;
  if (total <= 1) throw new ValidationError("No puedes borrar el único perfil de agencia");
  if (existing.isDefault) throw new ValidationError("No puedes borrar el perfil por defecto; marca otro como predeterminado primero");

  // Campaigns pointing here fall back to the default profile
  db.update(campaigns).set({ agencyProfileId: null }).where(eq(campaigns.agencyProfileId, id)).run();
  db.delete(agencyProfile).where(eq(agencyProfile.id, id)).run();

  logActivity("setting_change", `Perfil "${existing.label || existing.name || id}" eliminado`, {
    metadata: { profileId: id },
  });
}

/**
 * Onboarding upsert: always targets the default profile, creating it (as default) if none exists.
 * Mirrors identity to the settings table since it is the default profile.
 */
export function upsertAgencyProfile(data: AgencyProfileData): AgencyProfileRow {
  const current = getDefaultAgencyProfile();
  if (!current) {
    return createAgencyProfile({ ...data, isDefault: true });
  }
  return updateAgencyProfile(current.id, data);
}

export function markOnboardingComplete(source: "url" | "manual" | "skipped" = "manual"): AgencyProfileRow {
  const now = new Date().toISOString();
  const profile = upsertAgencyProfile({ completedAt: now, source });
  logActivity("setting_change", `Onboarding completado (origen: ${source})`, {
    metadata: { source, completedAt: now },
  });
  return profile;
}

/** Reset onboarding by removing the default profile (promotes another profile if any remain). */
export function resetAgencyProfile(): void {
  const current = getDefaultAgencyProfile();
  if (!current) return;
  db.delete(agencyProfile).where(eq(agencyProfile.id, current.id)).run();
  const next = db.select().from(agencyProfile).orderBy(agencyProfile.id).get();
  if (next) {
    db.update(agencyProfile).set({ isDefault: true }).where(eq(agencyProfile.id, next.id)).run();
  }
}
