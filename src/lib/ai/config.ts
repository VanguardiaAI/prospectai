import { GoogleGenerativeAI } from "@google/generative-ai";
import { db, getSetting, getApiKey } from "@/db";
import { agencyProfile } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getPortfolioProjects, getAnsweredKnowledge, type PortfolioProject } from "@/db/portfolio";
import { rankProjectsByRelevance } from "./relevance";

let _genAI: GoogleGenerativeAI | null = null;
let _genAIKey = "";

/**
 * Lazily build and cache the Gemini client, re-creating it when the resolved
 * API key changes so keys edited in the app take effect without a restart.
 */
export function getGenAI(): GoogleGenerativeAI {
  const key = getApiKey("gemini_api_key", "GEMINI_API_KEY");
  if (!_genAI || key !== _genAIKey) {
    _genAI = new GoogleGenerativeAI(key);
    _genAIKey = key;
  }
  return _genAI;
}

export function safeParseJSON<T>(jsonStr: string, label: string): T {
  try {
    return JSON.parse(jsonStr) as T;
  } catch (e) {
    throw new Error(`Failed to parse Gemini ${label} response: ${(e as Error).message}. Raw: ${jsonStr.slice(0, 200)}`);
  }
}

export function cleanJsonResponse(text: string): string {
  return text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
}

// --- Service definitions ---

export const SERVICE_DEFINITIONS: Record<string, { label: string; description: string }> = {
  web_development: {
    label: "Web Development",
    description: "Professional website design and development, landing pages, e-commerce and web applications",
  },
  seo: {
    label: "SEO",
    description: "Search engine optimization, SEO audits, content strategy and organic ranking",
  },
  ai_agents: {
    label: "AI / Chatbots",
    description: "AI-powered virtual assistants for customer service, bookings, automated FAQs and process automation",
  },
  google_business: {
    label: "Google Business Profile",
    description: "Google listing optimization, review management, photos, posts and local SEO",
  },
  social_media: {
    label: "Social Media",
    description: "Social media management, content strategy, Meta/TikTok advertising and community management",
  },
};

function servicesFromKeys(raw: string | null | undefined): { key: string; label: string; description: string }[] {
  return (raw || "").split(",").map((s) => s.trim()).filter(Boolean).map((key) => ({
    key,
    label: SERVICE_DEFINITIONS[key]?.label || key,
    description: SERVICE_DEFINITIONS[key]?.description || key,
  }));
}

export function getEnabledServices(): { key: string; label: string; description: string }[] {
  return servicesFromKeys(getSetting("agency_services") || "web_development");
}

// --- Agency context helper ---

export interface AgencyContext {
  name: string;
  url: string;
  description: string;
  tagline: string;
  ownerName: string;
  ownerRole: string;
  city: string;
  services: { key: string; label: string; description: string }[];
  customServices: { label: string; description: string }[];
  valueProps: string[];
  caseStudies: { client: string; result: string; snippet?: string }[];
  // Structured portfolio projects (the rich "proof") + answered interview Q&A.
  projects: PortfolioProject[];
  knowledge: { question: string; answer: string; projectId: number | null }[];
  country: string;
  locale: string;
}

function parseJsonArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Resolve a profile row by id, falling back to the default (flagged or lowest-id) profile. */
function resolveProfileRow(profileId?: number | null): typeof agencyProfile.$inferSelect | null {
  try {
    if (profileId) {
      return db.select().from(agencyProfile).where(eq(agencyProfile.id, profileId)).get() ?? null;
    }
    const flagged = db.select().from(agencyProfile).where(eq(agencyProfile.isDefault, true)).get();
    if (flagged) return flagged;
    return db.select().from(agencyProfile).orderBy(agencyProfile.id).get() ?? null;
  } catch {
    return null;
  }
}

/**
 * Build the agency identity injected into copy prompts. Pass a `profileId` to write as a
 * specific profile (per-campaign); omit it to use the default profile.
 */
export function getAgencyContext(profileId?: number | null): AgencyContext {
  const profile = resolveProfileRow(profileId);
  const resolvedId = profile?.id ?? null;

  const profileServices = servicesFromKeys(profile?.services);

  // The knowledge base lives in its own tables; never let a read failure (e.g. a
  // brand-new DB mid-migration) break copy generation — fall back to empty.
  let projects: PortfolioProject[] = [];
  let knowledge: AgencyContext["knowledge"] = [];
  try {
    projects = getPortfolioProjects(resolvedId);
    knowledge = getAnsweredKnowledge(resolvedId);
  } catch {
    /* knowledge base unavailable — proceed with identity-only context */
  }

  return {
    name: profile?.name || getSetting("agency_name") || "ProspectAI",
    url: profile?.url || getSetting("agency_url") || "",
    description: profile?.description || getSetting("agency_description") || "",
    tagline: profile?.tagline || "",
    ownerName: profile?.ownerName || getSetting("from_name") || "",
    ownerRole: profile?.ownerRole || "",
    city: profile?.city || "",
    services: profileServices.length ? profileServices : getEnabledServices(),
    customServices: parseJsonArray(profile?.customServices ?? null),
    valueProps: parseJsonArray(profile?.valueProps ?? null),
    caseStudies: parseJsonArray(profile?.caseStudies ?? null),
    projects,
    knowledge,
    country: profile?.country || getSetting("target_country") || "US",
    locale: getSetting("locale") || "en-US",
  };
}

// --- Agency context formatting for prompts ---

/** One portfolio project rendered as a compact, prompt-friendly block. */
function formatProjectEntry(p: PortfolioProject, knowledge: { question: string; answer: string }[]): string {
  const head = [p.title, p.sector, p.client ? `cliente: ${p.client}` : ""].filter(Boolean).join(" · ");
  const sub: string[] = [];
  if (p.problem) sub.push(`Problema: ${p.problem}`);
  if (p.solution) sub.push(`Solución: ${p.solution}`);
  if (p.deliverables) sub.push(`Entregables: ${p.deliverables}`);
  const resultLine = [p.result, p.metric].filter(Boolean).join(" · ");
  if (resultLine) sub.push(`Resultado: ${resultLine}`);
  if (p.stack.length) sub.push(`Stack: ${p.stack.join(", ")}`);
  if (p.durationLabel) sub.push(`Duración: ${p.durationLabel}`);
  if (p.testimonial) sub.push(`Testimonio: "${p.testimonial}"${p.testimonialAuthor ? ` — ${p.testimonialAuthor}` : ""}`);
  if (p.projectUrl) sub.push(`URL: ${p.projectUrl}`);
  for (const k of knowledge) sub.push(`${k.question} → ${k.answer}`);
  return [`- ${head}`, ...sub.map((s) => `  ${s}`)].join("\n");
}

export interface AgencyContextFormatOptions {
  /** Free-text hint (prospect category/sector, inbound message, brief) used to rank projects. */
  relevanceHint?: string | null;
  /** Max projects to include (keeps the prompt focused). Default 4. */
  maxProjects?: number;
}

export function formatAgencyContextBlock(ctx: AgencyContext, opts: AgencyContextFormatOptions = {}): string {
  const lines: string[] = [];
  lines.push(`Nombre: ${ctx.name}`);
  if (ctx.tagline) lines.push(`Propuesta: ${ctx.tagline}`);
  if (ctx.description) lines.push(`Qué hace: ${ctx.description}`);
  if (ctx.url) lines.push(`URL: ${ctx.url}`);
  if (ctx.city) lines.push(`Sede: ${ctx.city}`);
  if (ctx.ownerName || ctx.ownerRole) {
    const role = ctx.ownerRole ? ` (${ctx.ownerRole})` : "";
    lines.push(`Responsable: ${ctx.ownerName || "—"}${role}`);
  }

  const allServices = [
    ...ctx.services.map((s) => `- ${s.label}: ${s.description}`),
    ...ctx.customServices.map((s) => `- ${s.label}: ${s.description}`),
  ];
  if (allServices.length) {
    lines.push("Servicios reales que ofrece:");
    lines.push(allServices.join("\n"));
  }

  if (ctx.valueProps.length) {
    lines.push("Diferenciadores:");
    lines.push(ctx.valueProps.map((v) => `- ${v}`).join("\n"));
  }

  // Structured portfolio projects are the rich proof. Rank by relevance to the
  // recipient and include only the top few so the prompt stays focused. Answered
  // interview Q&A for a shown project is attached under that project.
  const shown = rankProjectsByRelevance(ctx.projects, opts.relevanceHint, opts.maxProjects ?? 4);
  if (shown.length) {
    lines.push("Proyectos del portafolio (reales — cita el que MEJOR encaje con el destinatario, sin inventar ni exagerar):");
    for (const p of shown) {
      const k = ctx.knowledge.filter((x) => x.projectId === p.id).map((x) => ({ question: x.question, answer: x.answer }));
      lines.push(formatProjectEntry(p, k));
    }
  } else if (ctx.caseStudies.length) {
    // Fallback to legacy case studies only when there are no structured projects.
    lines.push("Casos de éxito (úsalos solo si el ángulo encaja, NO los inventes ni los exageres):");
    lines.push(ctx.caseStudies.map((c) => `- ${c.client}: ${c.result}${c.snippet ? ` — "${c.snippet}"` : ""}`).join("\n"));
  }

  // Agency-wide answered Q&A (not tied to a specific project).
  const generalKnowledge = ctx.knowledge.filter((k) => k.projectId == null);
  if (generalKnowledge.length) {
    lines.push("Conocimiento adicional (datos reales que dio el usuario, úsalos con naturalidad):");
    lines.push(generalKnowledge.map((k) => `- ${k.question} → ${k.answer}`).join("\n"));
  }

  return lines.join("\n");
}

// --- Locale helpers ---

export function getLocaleLabel(country: string): string {
  const map: Record<string, string> = {
    ES: "español (España)",
    MX: "español (México)",
    AR: "español (Argentina)",
    CO: "español (Colombia)",
    CL: "español (Chile)",
    PE: "español (Perú)",
    EC: "español (Ecuador)",
    UY: "español (Uruguay)",
    US: "inglés (Estados Unidos)",
    UK: "inglés (Reino Unido)",
    CA: "inglés (Canadá)",
    AU: "inglés (Australia)",
    BR: "portugués (Brasil)",
    PT: "portugués (Portugal)",
    FR: "francés (Francia)",
    DE: "alemán (Alemania)",
    IT: "italiano (Italia)",
    NL: "neerlandés (Países Bajos)",
  };
  return map[country] || "English";
}

export function getLocaleWritingRules(country: string): string {
  const formatting = `- NUNCA uses em dash (—) ni guion largo. Usa comas, puntos o guiones cortos (-) para separar ideas.
- NUNCA uses signo de exclamación de apertura (¡). Solo usa el de cierre (!) cuando sea estrictamente necesario.
- NUNCA uses signo de interrogación de apertura (¿) en mensajes de WhatsApp. En WhatsApp nadie lo usa, queda robótico. Solo usa el de cierre (?). En emails sí puedes usarlo si la región lo requiere.
- Preséntate SIEMPRE como una persona real: "Soy [nombre], de [empresa]". NUNCA digas "Soy [empresa]" ni te presentes como si fueras la empresa misma.
- Escribe de forma natural y humana. Evita construcciones rígidas o que suenen a copy publicitario.
- SIEMPRE conecta cualquier problema detectado con un IMPACTO DE NEGOCIO concreto: pérdida de clientes, menos ventas, peor visibilidad, etc. NUNCA listes problemas técnicos sin explicar qué pierde el negocio por eso.`;

  const regional: Record<string, string> = {
    ES: `- Región: España. Usa "tú" y "vosotros" de forma natural.
- El registro debe sonar como un profesional español hablando a otro profesional.`,
    MX: `- Región: México. Usa "tú" y "ustedes". NUNCA uses "vosotros", "habéis", "tenéis", "hacéis", "podéis" ni NINGUNA forma verbal con -éis/-áis.
- No uses modismos de España: "mola", "tío", "vale" (como afirmación), "quedamos", "currar", "genial" en exceso.
- El registro debe sonar como un profesional mexicano hablando a otro profesional mexicano.`,
    AR: `- Región: Argentina. Usa "vos" y "ustedes". NUNCA uses "vosotros" ni "tú".
- Conjugaciones de voseo: "tenés", "sabés", "podés", "querés".
- El registro debe sonar como un profesional argentino hablando a otro profesional.`,
    CO: `- Región: Colombia. Usa "tú" o "usted" y "ustedes". NUNCA uses "vosotros".
- El registro debe sonar como un profesional colombiano hablando a otro profesional.`,
    CL: `- Región: Chile. Usa "tú" y "ustedes". NUNCA uses "vosotros".
- El registro debe sonar como un profesional chileno hablando a otro profesional.`,
    PE: `- Región: Perú. Usa "tú" o "usted" y "ustedes". NUNCA uses "vosotros".
- El registro debe sonar como un profesional peruano hablando a otro profesional.`,
    EC: `- Región: Ecuador. Usa "tú" o "usted" y "ustedes". NUNCA uses "vosotros".
- El registro debe sonar como un profesional ecuatoriano hablando a otro profesional.`,
    UY: `- Región: Uruguay. Usa "tú" o "vos" y "ustedes". NUNCA uses "vosotros".
- El registro debe sonar como un profesional uruguayo hablando a otro profesional.`,
    US: `- Region: United States. Write in casual professional American English.`,
    UK: `- Region: United Kingdom. Write in professional British English.`,
    CA: `- Region: Canada. Write in professional Canadian English.`,
    AU: `- Region: Australia. Write in professional Australian English.`,
    BR: `- Região: Brasil. Escreva em português brasileiro profissional. NUNCA use português europeu.`,
    PT: `- Região: Portugal. Escreva em português europeu profissional.`,
    FR: `- Région: France. Écrivez en français professionnel.`,
    DE: `- Region: Deutschland. Schreiben Sie in professionellem Deutsch.`,
    IT: `- Regione: Italia. Scrivi in italiano professionale.`,
    NL: `- Regio: Nederland. Schrijf in professioneel Nederlands.`,
  };

  return `${formatting}\n${regional[country] || ""}`;
}
