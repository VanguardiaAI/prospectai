import { getGenAI, safeParseJSON, cleanJsonResponse, SERVICE_DEFINITIONS } from "./config";
import { withRetry } from "@/lib/ai/retry";
import { geminiRateLimiter } from "@/lib/ai/rate-limiter";
import { GEMINI_MAX_RETRIES, GEMINI_BASE_DELAY_MS } from "@/lib/constants";
import { scrapeWebsite, type ScrapeResult } from "@/lib/scraper";

export interface ExtractedAgency {
  name: string | null;
  tagline: string | null;
  description: string | null;
  ownerName: string | null;
  ownerRole: string | null;
  contactEmail: string | null;
  contactPhone: string | null;
  city: string | null;
  country: string | null; // ISO-2 (ES, MX, US, etc.)
  services: string[]; // keys from SERVICE_DEFINITIONS detected on the site
  customServices: { label: string; description: string }[];
  valueProps: string[];
  caseStudies: { client: string; result: string; snippet?: string }[];
}

const COMMON_PATHS = [
  "/", // home (handled separately as the canonical URL)
  "/about",
  "/about-us",
  "/sobre-nosotros",
  "/nosotros",
  "/quienes-somos",
  "/services",
  "/servicios",
  "/contact",
  "/contacto",
  "/team",
  "/equipo",
];

function urlOrigin(url: string): string | null {
  try {
    return new URL(url).origin;
  } catch {
    return null;
  }
}

function buildCandidateUrls(baseUrl: string): string[] {
  const origin = urlOrigin(baseUrl);
  if (!origin) return [baseUrl];
  const seen = new Set<string>();
  const out: string[] = [];
  // Always start with the canonical URL the user provided
  if (!seen.has(baseUrl)) {
    seen.add(baseUrl);
    out.push(baseUrl);
  }
  for (const path of COMMON_PATHS) {
    if (path === "/") continue;
    const candidate = origin + path;
    if (!seen.has(candidate)) {
      seen.add(candidate);
      out.push(candidate);
    }
  }
  return out;
}

export interface MultiScrapeResult {
  pages: { url: string; result: ScrapeResult }[];
  rootSucceeded: boolean;
  combinedContent: string;
  combinedEmails: string[];
}

export async function multiPageScrape(baseUrl: string): Promise<MultiScrapeResult> {
  const candidates = buildCandidateUrls(baseUrl);
  const results = await Promise.allSettled(candidates.map((u) => scrapeWebsite(u)));

  const pages: { url: string; result: ScrapeResult }[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      pages.push({ url: candidates[i], result: r.value });
    }
  });

  const successful = pages.filter((p) => p.result.success);
  const rootSucceeded = pages[0]?.result.success ?? false;

  const combinedContent = successful
    .map((p) => `--- ${p.url} ---\n${[p.result.title, p.result.description, p.result.content].filter(Boolean).join("\n")}`)
    .join("\n\n")
    .substring(0, 12000);

  const allEmails = new Set<string>();
  successful.forEach((p) => (p.result.emails || []).forEach((e) => allEmails.add(e)));

  return {
    pages,
    rootSucceeded,
    combinedContent,
    combinedEmails: [...allEmails],
  };
}

const SERVICE_KEYS = Object.keys(SERVICE_DEFINITIONS);

export async function extractAgencyFromScrape(
  baseUrl: string,
  scrape: MultiScrapeResult
): Promise<ExtractedAgency> {
  if (!scrape.rootSucceeded || scrape.combinedContent.length < 50) {
    throw new Error("No se pudo leer suficiente contenido de la web. Verifica la URL.");
  }

  const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });

  const servicesCatalog = SERVICE_KEYS
    .map((k) => `- ${k}: ${SERVICE_DEFINITIONS[k].label} (${SERVICE_DEFINITIONS[k].description})`)
    .join("\n");

  const emailsHint = scrape.combinedEmails.length
    ? `\nEMAILS DETECTADOS EN LA WEB (puede haber genéricos o personales):\n${scrape.combinedEmails.join(", ")}`
    : "";

  const prompt = `Eres un analista que extrae datos estructurados de la web de una agencia o profesional para construir su perfil. Analiza el contenido scrapeado y devuelve SOLO datos REALES presentes en el texto. NO inventes nombres, servicios, ni casos de éxito que no estén explícitos.

URL DE LA AGENCIA: ${baseUrl}

CONTENIDO SCRAPEADO (varias páginas concatenadas):
${scrape.combinedContent}
${emailsHint}

CATÁLOGO DE SERVICIOS ESTÁNDAR (mapea a estas keys SOLO si la agencia ofrece algo equivalente):
${servicesCatalog}

INSTRUCCIONES:
1. "name": Nombre comercial de la agencia/profesional. Si no es claro, deduce del título o del dominio. Sin sufijos legales (S.L., LLC, etc.) salvo que sea parte del branding visible.
2. "tagline": Frase de propuesta de valor (1 línea, ~10 palabras) si la web la tiene. Null si no.
3. "description": 1-2 frases describiendo qué hace la agencia, basado en el contenido. Tono neutro.
4. "ownerName": Nombre real del fundador/responsable si aparece en about/team. Null si no aparece (NO inventes).
5. "ownerRole": Cargo del responsable (CEO, fundador, director, etc.) si está. Null si no.
6. "contactEmail": Email principal de contacto. Prefiere uno de los detectados. Null si no hay.
7. "contactPhone": Teléfono principal con código país si aparece. Null si no.
8. "city": Ciudad principal de operación si se menciona. Null si no.
9. "country": Código ISO-2 del país (ES, MX, AR, CO, CL, PE, EC, UY, US, UK, CA, AU, BR, PT, FR, DE, IT, NL). Deduce de TLD del dominio, dirección, o idioma + indicios. Null si no se puede deducir con confianza.
10. "services": Array de keys del catálogo arriba que la agencia REALMENTE ofrece según el contenido. Vacío si no se puede mapear.
11. "customServices": Array de servicios que ofrecen y NO encajan en el catálogo. Cada item: {"label": "Nombre del servicio", "description": "1 línea"}. Vacío si todo encaja.
12. "valueProps": Array de 2-4 frases que destacan diferenciadores REALES mencionados (años de experiencia, especialización, tecnologías, etc.). Vacío si no hay nada concreto.
13. "caseStudies": Array de casos de éxito o clientes reconocidos mencionados. Cada item: {"client": "Nombre", "result": "qué resultado se logró", "snippet": "cita opcional"}. Vacío si no se mencionan.

Si un campo no está en el contenido, usa null (string fields) o [] (arrays). NO inventes datos.

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "name": "...",
  "tagline": null,
  "description": "...",
  "ownerName": null,
  "ownerRole": null,
  "contactEmail": null,
  "contactPhone": null,
  "city": null,
  "country": null,
  "services": [],
  "customServices": [],
  "valueProps": [],
  "caseStudies": []
}`;

  const result = await withRetry(async () => {
    await geminiRateLimiter.acquire();
    return model.generateContent(prompt);
  }, { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS, label: "extract-agency" });

  const text = result.response.text().trim();
  const jsonStr = cleanJsonResponse(text);
  const parsed = safeParseJSON<ExtractedAgency>(jsonStr, "extract-agency");

  // Sanity defaults
  return {
    name: parsed.name || null,
    tagline: parsed.tagline || null,
    description: parsed.description || null,
    ownerName: parsed.ownerName || null,
    ownerRole: parsed.ownerRole || null,
    contactEmail: parsed.contactEmail || null,
    contactPhone: parsed.contactPhone || null,
    city: parsed.city || null,
    country: parsed.country || null,
    services: Array.isArray(parsed.services) ? parsed.services.filter((k) => SERVICE_KEYS.includes(k)) : [],
    customServices: Array.isArray(parsed.customServices) ? parsed.customServices : [],
    valueProps: Array.isArray(parsed.valueProps) ? parsed.valueProps : [],
    caseStudies: Array.isArray(parsed.caseStudies) ? parsed.caseStudies : [],
  };
}

export async function scrapeAndExtract(baseUrl: string): Promise<{ extracted: ExtractedAgency; pagesScraped: number }> {
  const scrape = await multiPageScrape(baseUrl);
  const extracted = await extractAgencyFromScrape(baseUrl, scrape);
  return { extracted, pagesScraped: scrape.pages.filter((p) => p.result.success).length };
}
