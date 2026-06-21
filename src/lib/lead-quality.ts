import { parsePhoneNumberFromString } from "libphonenumber-js/max";

/**
 * Lead reachability classification, shared by the search results UI (runs in
 * the browser) and the import route (runs on the server). This module is
 * deliberately DB-FREE and has no Node-only imports so it can be bundled on
 * both sides — that is why the pure email helpers (isContactEmail / extractEmails)
 * live here and `scraper.ts` (which imports child_process) re-exports them.
 *
 * Policy is the "Equilibrado" setting the user chose:
 *  - Government sites/orgs are ALWAYS excluded (no sale possible, generic inbox).
 *  - Large hospitals/institutions, and truly unreachable leads, are demoted to
 *    `low` + hiddenByDefault: not pre-selected and hidden behind a toggle, but
 *    re-includable by the user.
 *  - Small businesses with only a generic/role email (info@/contacto@) are KEPT
 *    as `low` priority — never silently dropped.
 *  - Everything else is `good` and pre-selected for import.
 */

// ---------------------------------------------------------------------------
// Email helpers (moved here from scraper.ts so the browser bundle can use them)
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

// Domains that are never real contact addresses: telemetry/placeholders/host SDKs,
// plus medical DIRECTORIES (Doctoralia/Docplanner) whose listed "email" is the
// directory's own support inbox — it never reaches the doctor or clinic, and it is
// shared across many listings (which also creates false "same company" dedup hits).
const IGNORED_DOMAINS = ["example.com", "sentry", "wixpress", "doctoralia", "docplanner", "doctoranytime"];

// The TLD pattern in EMAIL_REGEX (\.[a-zA-Z]{2,}) also matches asset extensions,
// so filenames like `bg-info@2x.png` or `logo@3x.svg` look like valid emails.
// Reject any match whose "domain" ends in a non-email asset extension...
const ASSET_EXT =
  /\.(png|jpe?g|gif|svg|webp|avif|ico|bmp|tiff?|css|js|mjs|json|woff2?|ttf|eot|otf|mp4|webm|mp3|pdf|zip)$/i;
// ...or that uses a retina filename suffix (`@2x.`, `@3x.`).
const RETINA_SUFFIX = /@\d+x\./i;

/**
 * True if a string is a plausible contact address rather than a telemetry/
 * placeholder domain or an asset filename (e.g. `bg-info@2x.png`) that the loose
 * email regex captures as a false positive.
 */
export function isContactEmail(email: string): boolean {
  return (
    !IGNORED_DOMAINS.some((d) => email.includes(d)) &&
    !ASSET_EXT.test(email) &&
    !RETINA_SUFFIX.test(email)
  );
}

/** Extract real contact emails from raw page content. */
export function extractEmails(content: string): string[] {
  return [...new Set(content.match(EMAIL_REGEX) || [])].filter(isContactEmail);
}

/**
 * Normalize the many shapes a stored email field can take (JSON-array string,
 * comma/semicolon/space-separated list, a single address, or a real array) into
 * a deduped list of real contact addresses. Mirrors the parsing the Google Maps
 * import path used inline.
 */
export function parseEmailsField(emails: string | string[] | null | undefined): string[] {
  if (!emails) return [];
  let candidates: string[] = [];
  if (Array.isArray(emails)) {
    candidates = emails.map(String);
  } else {
    const str = emails.trim();
    if (!str || str === "[]") return [];
    try {
      const parsed = JSON.parse(str);
      if (Array.isArray(parsed)) candidates = parsed.map(String);
      else if (typeof parsed === "string") candidates = [parsed];
      else candidates = [str];
    } catch {
      candidates = [str];
    }
  }
  return [
    ...new Set(
      candidates
        .flatMap((c) => c.split(/[\s,;]+/))
        .map((e) => e.trim())
        .filter((e) => e.includes("@") && isContactEmail(e)),
    ),
  ];
}

/** True if the field contains at least one real contact email. */
export function hasContactEmail(emails: string | string[] | null | undefined): boolean {
  return parseEmailsField(emails).length > 0;
}

// ---------------------------------------------------------------------------
// Analysis hygiene
// ---------------------------------------------------------------------------

// The website analysis only ever sees an automated, text-only extract (no
// rendered DOM, no images). When that text is sparse the model used to invent
// "the site looks cut off / incomplete / broken", which then leaked verbatim
// into the outreach copy. We drop any issue that makes an unverifiable claim
// about the site being visually incomplete or unavailable, while keeping real,
// checkable findings (missing meta description, no H1, etc.).
const BANNED_ISSUE_PATTERNS =
  /(cortad|incomplet|inacabad|a medias|sin terminar|en construcci[oó]n|rot[oa]\b|ca[ií]d[oa]|no carga|no abre|no funciona|fuera de l[ií]nea|se ve mal|mal hecha|inaccesibl|disfuncional|disfunci[oó]n|inutilizabl|inservible|error cr[ií]tico|falla (grave|cr[ií]tica)|intervenci[oó]n urgente|restaurar la funcionalidad|no se (puede|pueden) (usar|navegar|acceder)|parece (inacabad|incomplet|sin)|under construction|broken|cut off|cut-off|incomplete|inaccessible|not working|doesn'?t work)/i;

/** Remove issues that assert the site is visually incomplete/unavailable. */
export function sanitizeIssues(issues: string[] | null | undefined): string[] {
  if (!issues) return [];
  return issues.filter(
    (i) => typeof i === "string" && i.trim().length > 0 && !BANNED_ISSUE_PATTERNS.test(i),
  );
}

/**
 * Drop whole sentences from a free-text summary that make an unverifiable
 * "site is broken/cut off/incomplete" claim, keeping the rest. Returns "" if
 * nothing trustworthy remains (callers/UI treat empty as "no summary").
 */
export function sanitizeSummary(summary: string | null | undefined): string {
  if (!summary) return "";
  const sentences = summary.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => s.trim().length > 0 && !BANNED_ISSUE_PATTERNS.test(s));
  return kept.join(" ").trim();
}

// Generic / role-based local-parts: reachable, but not a person — lower value.
const ROLE_LOCALPARTS = new Set([
  "contacto", "contact", "info", "informacion", "información", "ventas", "sales",
  "administracion", "administración", "admin", "recepcion", "recepción", "reception",
  "citas", "pacientes", "atencion", "atención", "atencionalcliente", "soporte", "support",
  "rrhh", "hr", "gerencia", "direccion", "dirección", "hola", "hello", "mail", "correo",
  "webmaster", "noreply", "no-reply", "newsletter", "marketing", "prensa", "comunicacion",
  "comunicación", "facturacion", "facturación", "cobranza", "general", "oficina", "clinica",
  "clínica", "consultorio",
]);

/** True if an email's local-part is a generic/role inbox rather than a person. */
export function isRoleEmail(email: string): boolean {
  const at = email.indexOf("@");
  if (at <= 0) return false;
  const local = email.slice(0, at).toLowerCase().trim();
  if (ROLE_LOCALPARTS.has(local)) return true;
  // `info2024`, `contacto.mx`, `ventas-clinica` → still role
  const head = local.split(/[.\-_+0-9]/)[0];
  return head.length > 0 && ROLE_LOCALPARTS.has(head);
}

// ---------------------------------------------------------------------------
// Domain helper (consolidates logic previously duplicated in the import route
// and the CSV importer)
// ---------------------------------------------------------------------------

/** Hostname without a leading `www.`, lowercased; null for empty/invalid input. */
export function extractDomain(website: string | null | undefined): string | null {
  if (!website) return null;
  try {
    const url = website.startsWith("http") ? website : `https://${website}`;
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Phone heuristic (offline). The authoritative check is getNumberId() right
// before sending a WhatsApp (see whatsapp-client.ts); this is only a hint for
// ranking/filtering and to label the results table.
// ---------------------------------------------------------------------------

export type PhoneType = "mobile" | "fixed_line" | "fixed_or_mobile" | "voip" | "other" | "unknown";

export interface PhoneClass {
  phoneType: PhoneType;
  /** Best-effort guess that the number could receive WhatsApp. */
  whatsappLikely: boolean;
}

function normalizePhoneType(t: string | undefined): PhoneType {
  switch (t) {
    case "MOBILE": return "mobile";
    case "FIXED_LINE": return "fixed_line";
    case "FIXED_LINE_OR_MOBILE": return "fixed_or_mobile";
    case "VOIP": return "voip";
    case undefined: return "unknown";
    default: return "other"; // TOLL_FREE, PREMIUM_RATE, PAGER, etc.
  }
}

/**
 * Classify a phone number as mobile/fixed/etc. For some countries (notably
 * Mexico) mobile and fixed share the same numbering plan, so the library returns
 * FIXED_LINE_OR_MOBILE — we treat that (and anything we can't parse) as
 * "WhatsApp likely" to avoid wrongly discarding leads; the real check happens at
 * send time.
 */
export function classifyPhone(phone: string | null | undefined, defaultCountry?: string): PhoneClass {
  const raw = (phone || "").trim();
  if (!raw) return { phoneType: "unknown", whatsappLikely: false };

  const region = defaultCountry && /^[A-Za-z]{2}$/.test(defaultCountry)
    ? (defaultCountry.toUpperCase() as Parameters<typeof parsePhoneNumberFromString>[1])
    : undefined;

  let pn;
  try {
    pn = parsePhoneNumberFromString(raw, region);
  } catch {
    pn = undefined;
  }
  if (!pn) return { phoneType: "unknown", whatsappLikely: true };

  const phoneType = normalizePhoneType(pn.getType());
  const whatsappLikely = !(phoneType === "fixed_line" || phoneType === "voip" || phoneType === "other");
  return { phoneType, whatsappLikely };
}

// ---------------------------------------------------------------------------
// Lead classification
// ---------------------------------------------------------------------------

export type LeadTier = "good" | "low" | "excluded";
export type EmailType = "personal" | "role" | "none";

export interface LeadQuality {
  tier: LeadTier;
  /** low leads that should be hidden by default (not pre-selected/shown). */
  hiddenByDefault: boolean;
  /** Spanish, human-readable reasons for the badge tooltip. */
  reasons: string[];
  phoneType: PhoneType;
  whatsappLikely: boolean;
  emailType: EmailType;
  /** 0-100, for ranking (best leads first). */
  reachabilityScore: number;
}

export interface ClassifyLeadInput {
  name?: string | null;
  category?: string | null;
  website?: string | null;
  /** Pre-extracted domain, if the caller already computed it. */
  domain?: string | null;
  emails?: string | string[] | null;
  phone?: string | null;
  defaultCountry?: string;
}

// Government / public-sector domains and org keywords. These are always excluded:
// no sale is possible and the inbox is a generic switchboard. Public health bodies
// (IMSS/ISSSTE, "hospital general", "centro de salud") count as government here.
const GOV_DOMAIN = /(^|\.)(gob|gov|gub|mil)(\.[a-z]{2})?$/i;
const GOV_TEXT =
  /\b(gobierno|gubernamental|ayuntamiento|municip\w*|alcald[ií]a|secretar[ií]a|ministerio|diputaci[oó]n|consejer[ií]a|generalitat|gobierno del estado|imss|issste|seguro social|instituto mexicano del seguro|hospital general|centro de salud|jurisdicci[oó]n sanitaria|dif)\b/i;

// Large medical institutions: switchboard phone + generic inbox, low conversion.
// Demoted (hidden by default) but re-includable, not hard-excluded.
const BIG_INSTITUTION =
  /\b(hospital|sanatorio|cl[ií]nica universitaria|centro m[eé]dico nacional|cruz roja|nosocomio)\b/i;

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

export function classifyLead(input: ClassifyLeadInput): LeadQuality {
  const domain = input.domain ?? extractDomain(input.website);
  const text = `${input.name || ""} ${input.category || ""}`;

  const emailList = parseEmailsField(input.emails);
  const emailType: EmailType =
    emailList.length === 0 ? "none" : emailList.some((e) => !isRoleEmail(e)) ? "personal" : "role";

  const { phoneType, whatsappLikely } = classifyPhone(input.phone, input.defaultCountry);

  // Government → always excluded.
  if ((domain && GOV_DOMAIN.test(domain)) || GOV_TEXT.test(text)) {
    return {
      tier: "excluded",
      hiddenByDefault: true,
      reasons: ["Sitio u organismo del gobierno"],
      phoneType,
      whatsappLikely,
      emailType,
      reachabilityScore: 0,
    };
  }

  const reasons: string[] = [];
  let score = 50;

  const isBig = BIG_INSTITUTION.test(text);
  if (isBig) {
    reasons.push("Hospital o institución grande");
    score -= 40;
  }

  if (emailType === "personal") {
    score += 30;
  } else if (emailType === "role") {
    reasons.push("Solo correo genérico (info@ / contacto@)");
    score += 5;
  } else {
    reasons.push("Sin correo de contacto");
    score -= 20;
  }

  if (phoneType === "fixed_line" || phoneType === "voip") {
    reasons.push("Teléfono fijo (probablemente sin WhatsApp)");
    score -= 15;
  } else if (!input.phone) {
    reasons.push("Sin teléfono");
    score -= 10;
  } else if (whatsappLikely) {
    score += 10;
  }

  // Hidden by default = a big institution, or a lead with no reachable channel
  // at all (no email and no WhatsApp-capable phone).
  const unreachable = emailType === "none" && !whatsappLikely;
  const hiddenByDefault = isBig || unreachable;

  // Tier (email-first outreach: a usable email is what makes a lead "good"):
  let tier: LeadTier;
  if (hiddenByDefault) {
    tier = "low";
  } else if (emailType === "personal") {
    tier = "good";
  } else {
    tier = "low";
  }

  return {
    tier,
    hiddenByDefault,
    reasons,
    phoneType,
    whatsappLikely,
    emailType,
    reachabilityScore: clamp(score, 0, 100),
  };
}
