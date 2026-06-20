import { db } from "@/db";
import { leads, blacklist, jobQueue } from "@/db/schema";
import { sql } from "drizzle-orm";
import Papa from "papaparse";
import * as XLSX from "xlsx";
import { logActivity } from "@/lib/activity";
import { MAX_CSV_SIZE_BYTES, MAX_CSV_ROWS } from "@/lib/constants";
import { extractDomain } from "@/lib/lead-quality";

// Lead fields a spreadsheet column can be mapped to.
export const LEAD_FIELDS = [
  "name", "category", "phone", "email", "website", "address", "city", "state", "rating", "reviewCount", "googleMapsUrl",
] as const;
export type LeadField = (typeof LEAD_FIELDS)[number];

// Spanish labels for the column-mapping UI.
export const LEAD_FIELD_LABELS: Record<LeadField, string> = {
  name: "Nombre", category: "Categoría", phone: "Teléfono", email: "Email", website: "Sitio web",
  address: "Dirección", city: "Ciudad", state: "Estado", rating: "Calificación", reviewCount: "Nº reseñas",
  googleMapsUrl: "URL Google Maps",
};

// Common header → field auto-mapping (Outscraper, Spanish, English).
export const COLUMN_MAP: Record<string, string> = {
  name: "name", nombre: "name", full_name: "name", title: "name", negocio: "name", empresa: "name",
  category: "category", categoría: "category", categoria: "category", type: "category", rubro: "category", giro: "category", especialidad: "category",
  phone: "phone", teléfono: "phone", telefono: "phone", phone_number: "phone", celular: "phone", móvil: "phone", movil: "phone", whatsapp: "phone",
  email: "email", correo: "email", email_1: "email", "correo_electrónico": "email", mail: "email", "e-mail": "email",
  site: "website", website: "website", web: "website", sitio_web: "website", url_web: "website",
  full_address: "address", address: "address", dirección: "address", direccion: "address", street_address: "address", domicilio: "address",
  city: "city", ciudad: "city", localidad: "city",
  state: "state", estado: "state", provincia: "state",
  rating: "rating", calificación: "rating", calificacion: "rating",
  reviews: "reviewCount", review_count: "reviewCount", reviews_count: "reviewCount", total_reviews: "reviewCount", "nº_reseñas": "reviewCount",
  google_maps_url: "googleMapsUrl", url: "googleMapsUrl", link: "googleMapsUrl", place_url: "googleMapsUrl",
};

function normalizeHeader(h: string): string {
  return h.toLowerCase().trim().replace(/\s+/g, "_");
}

/** Best-guess mapping from raw spreadsheet headers to lead fields ("" = ignore). */
export function suggestMapping(headers: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const h of headers) out[h] = COLUMN_MAP[normalizeHeader(h)] || "";
  return out;
}

export interface ParsedTable {
  headers: string[];
  rows: Record<string, string>[];
}

function stringifyRow(row: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) out[k] = v == null ? "" : String(v);
  return out;
}

/**
 * Parse a CSV/TSV or XLSX/XLS file (as raw bytes) into headers + string rows.
 * Used by the import preview and by the mapped import.
 */
export function parseTabular(data: ArrayBuffer | Buffer, filename: string): ParsedTable {
  if (data.byteLength > MAX_CSV_SIZE_BYTES) {
    throw new Error(`El archivo supera el límite de ${Math.round(MAX_CSV_SIZE_BYTES / 1024 / 1024)} MB`);
  }
  const lower = filename.toLowerCase();

  if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
    const wb = XLSX.read(data, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    if (!ws) return { headers: [], rows: [] };
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "", raw: false });
    const headers = rows.length ? Object.keys(rows[0]) : [];
    return { headers, rows: rows.map(stringifyRow) };
  }

  // CSV / TSV
  const text = Buffer.isBuffer(data) ? data.toString("utf-8") : Buffer.from(data).toString("utf-8");
  const { data: parsed, errors } = Papa.parse<Record<string, string>>(text, { header: true, skipEmptyLines: true });
  if (errors.length > 0 && parsed.length === 0) {
    throw new Error(`Archivo inválido: ${errors[0]?.message || "error de parseo"}`);
  }
  const headers = parsed.length ? Object.keys(parsed[0]) : [];
  return { headers, rows: parsed };
}

export interface ImportResult {
  imported: number;
  skipped: number;
  blacklisted: number;
  duplicates: number;
  total: number;
}

export interface ImportOptions {
  campaignId?: number;
  /** Free-form classification tags applied to every imported lead. */
  tags?: string[];
  /** Provenance recorded on each lead. Defaults to "csv". */
  source?: string;
  /** Explicit raw-header → lead-field mapping. If omitted, auto-maps via COLUMN_MAP. */
  mapping?: Record<string, string>;
}

/** Map one raw row to lead fields using an explicit mapping or the auto COLUMN_MAP. */
function applyMapping(
  row: Record<string, string>,
  mapping?: Record<string, string>,
): Record<string, string> {
  const mapped: Record<string, string> = {};
  for (const [col, value] of Object.entries(row)) {
    if (value == null || String(value).trim() === "") continue;
    const field = mapping ? mapping[col] : COLUMN_MAP[normalizeHeader(col)];
    if (field && (LEAD_FIELDS as readonly string[]).includes(field)) {
      mapped[field] = String(value).trim();
    }
  }
  return mapped;
}

/**
 * Core import: insert leads from already-parsed rows, applying a column mapping,
 * blacklist filtering, and dedup (by name+city / phone / website). Records the
 * provenance (`source`) and optional classification `tags` on each lead.
 */
export function importLeadsFromRows(rows: Record<string, string>[], opts: ImportOptions = {}): ImportResult {
  if (rows.length > MAX_CSV_ROWS) {
    throw new Error(`El archivo tiene ${rows.length} filas, el máximo es ${MAX_CSV_ROWS}`);
  }

  const { campaignId, tags, source = "csv", mapping } = opts;
  const tagsJson = tags && tags.length ? JSON.stringify(tags) : null;

  // Get blacklisted domains and emails
  const blacklisted = db.select().from(blacklist).all();
  const blacklistSet = new Set(blacklisted.map((b) => b.value.toLowerCase()));

  // Build existing leads lookup for deduplication
  const existingLeads = db.select({
    name: sql<string>`lower(${leads.name})`,
    city: sql<string>`lower(coalesce(${leads.city}, ''))`,
    phone: leads.phone,
    website: sql<string>`lower(coalesce(${leads.website}, ''))`,
  }).from(leads).all();

  const dupeNameCity = new Set(existingLeads.map(l => `${l.name}||${l.city}`));
  const dupePhone = new Set(existingLeads.filter(l => l.phone).map(l => l.phone!));
  const dupeWebsite = new Set(existingLeads.filter(l => l.website).map(l => l.website));

  let imported = 0;
  let skipped = 0;
  let blacklistedCount = 0;
  let duplicates = 0;

  for (const row of rows) {
    const mapped = applyMapping(row, mapping);

    if (!mapped.name) {
      skipped++;
      continue;
    }

    // Check blacklist
    const domain = extractDomain(mapped.website || null);

    if (domain && blacklistSet.has(domain)) {
      blacklistedCount++;
      continue;
    }
    if (mapped.email && blacklistSet.has(mapped.email.toLowerCase())) {
      blacklistedCount++;
      continue;
    }

    // Check duplicates
    const nameLower = mapped.name.toLowerCase();
    const cityLower = (mapped.city || "").toLowerCase();
    const phoneTrim = mapped.phone || "";
    const websiteLower = (mapped.website || "").toLowerCase();

    const isDupeNameCity = dupeNameCity.has(`${nameLower}||${cityLower}`);
    const isDupePhone = phoneTrim && dupePhone.has(phoneTrim);
    const isDupeWebsite = websiteLower && dupeWebsite.has(websiteLower);

    if (isDupeNameCity || isDupePhone || isDupeWebsite) {
      duplicates++;
      continue;
    }

    // Mark as seen for subsequent rows in same import
    dupeNameCity.add(`${nameLower}||${cityLower}`);
    if (phoneTrim) dupePhone.add(phoneTrim);
    if (websiteLower) dupeWebsite.add(websiteLower);

    // Insert lead
    const lead = db.insert(leads).values({
      campaignId: campaignId ?? null,
      name: mapped.name,
      category: mapped.category || null,
      phone: mapped.phone || null,
      email: mapped.email || null,
      website: mapped.website || null,
      address: mapped.address || null,
      city: mapped.city || null,
      state: mapped.state || null,
      rating: mapped.rating ? parseFloat(mapped.rating) : null,
      reviewCount: mapped.reviewCount ? parseInt(mapped.reviewCount) : null,
      googleMapsUrl: mapped.googleMapsUrl || null,
      source,
      tags: tagsJson,
      status: "imported",
    }).returning().get();

    // Queue for scraping if has website
    if (mapped.website) {
      db.insert(jobQueue).values({
        type: "scrape",
        leadId: lead.id,
        campaignId: campaignId ?? null,
      }).run();
    }

    imported++;
  }

  logActivity("import", `Importados ${imported} negocios (${skipped} omitidos, ${blacklistedCount} en blacklist, ${duplicates} duplicados)`, {
    campaignId: campaignId ?? undefined,
    metadata: { imported, skipped, blacklisted: blacklistedCount, duplicates, total: rows.length, source, tags: tags ?? [] },
    messageKey: "activityLog.importedLeads",
    messageVars: { count: imported, skipped, blacklisted: blacklistedCount, duplicates },
  });

  return { imported, skipped, blacklisted: blacklistedCount, duplicates, total: rows.length };
}

/** Back-compat wrapper: parse a CSV string and import with auto-mapping. */
export function importLeadsFromCSV(csvText: string, campaignId?: number): ImportResult {
  if (csvText.length > MAX_CSV_SIZE_BYTES) {
    throw new Error(`CSV exceeds ${Math.round(MAX_CSV_SIZE_BYTES / 1024 / 1024)}MB size limit`);
  }
  const { data, errors } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  if (errors.length > 0 && data.length === 0) {
    throw new Error(`Invalid CSV: ${errors[0]?.message || "parse error"}`);
  }
  return importLeadsFromRows(data, { campaignId, source: "csv" });
}
