import { generateStructured } from "./provider";
import { withRetry } from "@/lib/ai/retry";
import { GEMINI_MAX_RETRIES, GEMINI_BASE_DELAY_MS } from "@/lib/constants";
import { getAgencyContext, formatAgencyContextBlock } from "./config";
import { fenced } from "./fence";
import { scrapeWebsite } from "@/lib/scraper";
import { multiPageScrape } from "./extract-agency";
import { getPortfolioProjects, getExistingQuestionTexts, type EnrichmentQuestionInput } from "@/db/portfolio";

// ── Project extraction from the user's own site ─────────────────────

export interface ExtractedPortfolioProject {
  title: string;
  client: string | null;
  sector: string | null;
  problem: string | null;
  solution: string | null;
  services: string[];
  stack: string[];
  result: string | null;
  metric: string | null;
  testimonial: string | null;
  testimonialAuthor: string | null;
  projectUrl: string | null;
  tags: string[];
}

const PORTFOLIO_EXTRACT_SCHEMA = {
  type: "object",
  properties: {
    projects: {
      type: "array",
      items: {
        type: "object",
        properties: {
          title: { type: "string" },
          client: { type: ["string", "null"] },
          sector: { type: ["string", "null"] },
          problem: { type: ["string", "null"] },
          solution: { type: ["string", "null"] },
          services: { type: "array", items: { type: "string" } },
          stack: { type: "array", items: { type: "string" } },
          result: { type: ["string", "null"] },
          metric: { type: ["string", "null"] },
          testimonial: { type: ["string", "null"] },
          testimonialAuthor: { type: ["string", "null"] },
          projectUrl: { type: ["string", "null"] },
          tags: { type: "array", items: { type: "string" } },
        },
        required: [
          "title", "client", "sector", "problem", "solution", "services", "stack",
          "result", "metric", "testimonial", "testimonialAuthor", "projectUrl", "tags",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["projects"],
  additionalProperties: false,
} as const;

// Portfolio-specific pages, in addition to the home/about/services pages that
// multiPageScrape already covers. Improves project recall on sites that hide work
// behind a dedicated section.
const PORTFOLIO_PATHS = [
  "/portfolio", "/portafolio", "/proyectos", "/projects", "/work", "/trabajos",
  "/casos", "/casos-de-exito", "/case-studies", "/clientes",
];

function strOrNull(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function strArray(v: unknown): string[] {
  return Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean).slice(0, 12) : [];
}

function normalizeExtractedProject(p: ExtractedPortfolioProject): ExtractedPortfolioProject {
  return {
    title: (p.title || "").trim(),
    client: strOrNull(p.client),
    sector: strOrNull(p.sector),
    problem: strOrNull(p.problem),
    solution: strOrNull(p.solution),
    services: strArray(p.services),
    stack: strArray(p.stack),
    result: strOrNull(p.result),
    metric: strOrNull(p.metric),
    testimonial: strOrNull(p.testimonial),
    testimonialAuthor: strOrNull(p.testimonialAuthor),
    projectUrl: strOrNull(p.projectUrl),
    tags: strArray(p.tags),
  };
}

/** Scrape a few extra portfolio-specific paths and return their combined text. */
async function scrapeExtraPaths(baseUrl: string, paths: string[]): Promise<string> {
  let origin: string;
  try {
    origin = new URL(baseUrl).origin;
  } catch {
    return "";
  }
  const urls = paths.map((p) => origin + p);
  const results = await Promise.allSettled(urls.map((u) => scrapeWebsite(u)));
  const parts: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.success) {
      parts.push(`--- ${urls[i]} ---\n${[r.value.title, r.value.description, r.value.content].filter(Boolean).join("\n")}`);
    }
  });
  return parts.join("\n\n");
}

/** Extract structured portfolio projects from already-scraped site text. */
export async function extractPortfolioProjects(baseUrl: string, combinedContent: string): Promise<ExtractedPortfolioProject[]> {
  const content = (combinedContent || "").trim();
  if (content.length < 50) return [];

  const prompt = [
    "Eres un analista que extrae PROYECTOS REALES del portafolio de una agencia o profesional a partir del contenido de su sitio web.",
    `URL del sitio: ${baseUrl}`,
    "",
    fenced("CONTENIDO DEL SITIO (varias páginas)", content.slice(0, 16000)),
    "",
    "Extrae cada proyecto, caso de éxito o trabajo concreto que aparezca. Para cada uno captura SOLO datos reales presentes en el texto (no inventes ni rellenes):",
    "- title: nombre del proyecto o del cliente.",
    "- client: cliente o empresa (o null).",
    "- sector: rubro o industria del cliente (o null).",
    "- problem: necesidad o problema que tenía (o null).",
    "- solution: qué se construyó o el enfoque usado (o null).",
    "- services: servicios involucrados, palabras simples (o lista vacía).",
    "- stack: tecnologías o herramientas usadas (o lista vacía).",
    "- result: resultado concreto logrado (o null).",
    "- metric: una métrica titular si aparece, por ejemplo '3x tráfico' o '+40% ventas' (o null).",
    "- testimonial: cita textual de un cliente sobre el proyecto (o null).",
    "- testimonialAuthor: quién dijo esa cita (o null).",
    "- projectUrl: URL del proyecto en vivo o de su caso de estudio (o null).",
    "- tags: 2 a 5 etiquetas libres para relacionar el proyecto con futuros clientes (o lista vacía).",
    "Si el sitio no muestra proyectos concretos, devuelve una lista vacía.",
  ].join("\n");

  const res = await withRetry(
    () =>
      generateStructured<{ projects: ExtractedPortfolioProject[] }>({
        prompt,
        jsonSchema: PORTFOLIO_EXTRACT_SCHEMA,
        label: "extract-portfolio",
        maxTokens: 3000,
      }),
    { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS, label: "extract-portfolio" },
  );

  const arr = Array.isArray(res?.projects) ? res.projects : [];
  return arr.map(normalizeExtractedProject).filter((p) => p.title);
}

/** Scrape the user's site (home + about + services + portfolio pages) and extract projects. */
export async function scrapeAndExtractProjects(baseUrl: string): Promise<{ projects: ExtractedPortfolioProject[]; pagesScraped: number }> {
  const scrape = await multiPageScrape(baseUrl);
  const extra = await scrapeExtraPaths(baseUrl, PORTFOLIO_PATHS);
  const combined = [scrape.combinedContent, extra].filter(Boolean).join("\n\n").substring(0, 16000);
  const projects = await extractPortfolioProjects(baseUrl, combined);
  return { projects, pagesScraped: scrape.pages.filter((p) => p.result.success).length };
}

// ── The "AI interview": questions that would enrich the profile ─────

type EnrichCategory = "proof" | "process" | "differentiation" | "pricing" | "logistics" | "other";
const ENRICH_CATEGORIES: EnrichCategory[] = ["proof", "process", "differentiation", "pricing", "logistics", "other"];

const ENRICH_SCHEMA = {
  type: "object",
  properties: {
    questions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          question: { type: "string" },
          category: { type: "string", enum: ENRICH_CATEGORIES },
          priority: { type: "integer", minimum: 1, maximum: 5 },
          projectTitle: { type: ["string", "null"] },
        },
        required: ["question", "category", "priority", "projectTitle"],
        additionalProperties: false,
      },
    },
  },
  required: ["questions"],
  additionalProperties: false,
} as const;

interface RawEnrichQuestion {
  question: string;
  category: string;
  priority: number;
  projectTitle: string | null;
}

function normalizeCategory(c: string): EnrichCategory {
  return (ENRICH_CATEGORIES as string[]).includes(c) ? (c as EnrichCategory) : "other";
}

function clampPriority(p: number): number {
  if (!Number.isFinite(p)) return 3;
  return Math.min(5, Math.max(1, Math.round(p)));
}

/**
 * Look at what the profile already has (and what each project is missing) and
 * propose NEW questions whose answers would make proposals/replies more concrete.
 * Returns ready-to-persist inputs (projectTitle resolved to projectId); does not
 * persist — the caller decides. Already-asked questions are excluded so rounds
 * don't repeat.
 */
export async function generateEnrichmentQuestions(profileId?: number | null, max = 6): Promise<EnrichmentQuestionInput[]> {
  const ctx = getAgencyContext(profileId);
  const projects = getPortfolioProjects(profileId);
  const existing = getExistingQuestionTexts(profileId);

  const projectLines = projects.length
    ? projects
        .map((p) => {
          const missing: string[] = [];
          if (!p.result && !p.metric) missing.push("resultado/métrica");
          if (!p.problem) missing.push("problema");
          if (!p.solution) missing.push("solución");
          if (!p.stack.length) missing.push("stack");
          if (!p.testimonial) missing.push("testimonio");
          if (!p.sector) missing.push("sector");
          return `- ${p.title}${p.client ? ` (${p.client})` : ""}${missing.length ? ` — falta: ${missing.join(", ")}` : " — completo"}`;
        })
        .join("\n")
    : "(todavía no hay proyectos cargados)";

  const existingBlock = existing.length
    ? `\nPREGUNTAS QUE YA SE HICIERON (NO las repitas ni hagas variantes):\n${existing.map((q) => `- ${q}`).join("\n")}`
    : "";

  const prompt = [
    "Eres un consultor que ayuda a una agencia a completar su perfil para escribir mejores propuestas a prospectos y mejores respuestas a clientes que contestan.",
    "Tu objetivo: proponer preguntas cuya respuesta haría las propuestas más convincentes y diferenciadoras (datos de proyectos reales, resultados con números, diferenciadores, proceso de trabajo, plazos, rangos de precio).",
    "",
    "PERFIL ACTUAL:",
    formatAgencyContextBlock(ctx, { maxProjects: 8 }),
    "",
    "PROYECTOS CARGADOS (y qué les falta):",
    projectLines,
    existingBlock,
    "",
    `Propón hasta ${max} preguntas NUEVAS, ordenadas por impacto (priority 1 = la más valiosa, 5 = la menos).`,
    "Cada pregunta debe ser clara, específica y fácil de responder en 1-3 frases. Evita preguntas genéricas o que ya se hayan hecho.",
    "Para una pregunta sobre un proyecto concreto, pon su título EXACTO en projectTitle; para preguntas generales de la agencia, projectTitle = null.",
    "category: proof (resultados/casos), process (cómo trabajas), differentiation (qué te hace mejor), pricing (precios/rangos), logistics (plazos/capacidad), other.",
  ].join("\n");

  const res = await withRetry(
    () =>
      generateStructured<{ questions: RawEnrichQuestion[] }>({
        prompt,
        jsonSchema: ENRICH_SCHEMA,
        label: "portfolio-enrich",
        maxTokens: 1200,
      }),
    { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS, label: "portfolio-enrich" },
  );

  const byTitle = new Map(projects.map((p) => [p.title.toLowerCase().trim(), p.id]));
  const questions = Array.isArray(res?.questions) ? res.questions : [];
  return questions
    .filter((q) => q && typeof q.question === "string" && q.question.trim())
    .slice(0, max)
    .map((q) => ({
      agencyProfileId: profileId ?? null,
      projectId: q.projectTitle ? byTitle.get(q.projectTitle.toLowerCase().trim()) ?? null : null,
      question: q.question.trim(),
      category: normalizeCategory(q.category),
      priority: clampPriority(q.priority),
    }));
}
