import { chromium, type Browser } from "playwright";
import { generateStructured } from "./provider";
import { withRetry } from "@/lib/ai/retry";
import { logger } from "@/lib/logger";
import { GEMINI_MAX_RETRIES, GEMINI_BASE_DELAY_MS } from "@/lib/constants";
import { getAgencyContext, formatAgencyContextBlock } from "./config";
import { fenced } from "./fence";
import { getPortfolioProjects, getExistingQuestionTexts, type EnrichmentQuestionInput } from "@/db/portfolio";

// ── Project extraction from the user's own site ─────────────────────

export interface ExtractedPortfolioProject {
  title: string;
  client: string | null;
  sector: string | null;
  description: string | null;
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
          description: { type: ["string", "null"] },
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
          "title", "client", "sector", "description", "problem", "solution", "services", "stack",
          "result", "metric", "testimonial", "testimonialAuthor", "projectUrl", "tags",
        ],
        additionalProperties: false,
      },
    },
  },
  required: ["projects"],
  additionalProperties: false,
} as const;

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// Listing pages where projects (or links to their detail pages) usually live.
const LISTING_PATHS = [
  "/portfolio", "/portafolio", "/proyectos", "/projects", "/work", "/trabajos",
  "/casos", "/casos-de-exito", "/case-studies", "/clientes", "/about", "/servicios", "/services",
];
// Path fragments that mark a portfolio/project URL.
const PROJECT_KEYWORDS = ["portfolio", "portafolio", "proyecto", "project", "work", "trabajo", "caso", "case", "cliente"];
// Pages that are never a project detail.
const SKIP_PATH = /\/(about|about-us|sobre|nosotros|quienes|contact|contacto|blog|noticias|news|servicios?|services?|precios?|pricing|privac|terminos|terms|aviso|legal|cookies|tags?|categor|author|wp-|feed|login|cart|carrito|checkout|home|inicio)(\/|$)/i;
const ASSET_EXT = /\.(png|jpe?g|gif|svg|webp|avif|ico|css|js|mjs|json|pdf|zip|mp4|webm|woff2?|ttf|eot)(\?|$)/i;

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
    description: strOrNull(p.description),
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

/** Raw-fetch a page: returns its visible text (up to maxChars) plus same-origin links. */
async function fetchPage(url: string, maxChars = 20000): Promise<{ url: string; text: string; links: string[] } | null> {
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA }, redirect: "follow", signal: AbortSignal.timeout(15000) });
    if (!res.ok) return null;
    const html = await res.text();
    const title = (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || "").replace(/\s+/g, " ").trim();
    const desc = (html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([\s\S]*?)["']/i)?.[1] || "").replace(/\s+/g, " ").trim();
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, maxChars);
    return { url, text: [title, desc, text].filter(Boolean).join("\n"), links: extractLinks(html, url) };
  } catch {
    return null;
  }
}

/** Same-origin, hash-free, non-asset links found in the page HTML. */
function extractLinks(html: string, baseUrl: string): string[] {
  let origin: string;
  try { origin = new URL(baseUrl).origin; } catch { return []; }
  const out = new Set<string>();
  for (const m of html.matchAll(/<a\b[^>]*href=["']([^"']+)["']/gi)) {
    const href = m[1].trim();
    if (!href || /^(#|mailto:|tel:|javascript:)/i.test(href)) continue;
    let abs: URL;
    try { abs = new URL(href, baseUrl); } catch { continue; }
    if (abs.origin !== origin) continue;
    abs.hash = "";
    const u = abs.toString().replace(/\/+$/, "");
    if (ASSET_EXT.test(u)) continue;
    out.add(u);
  }
  return [...out];
}

/** Score a link as a likely project-detail page (>=1 = candidate, higher = stronger). */
function projectLinkScore(url: string): number {
  let p: string;
  try { p = new URL(url).pathname.toLowerCase().replace(/\/+$/, ""); } catch { return -1; }
  if (!p) return -1; // home
  if (SKIP_PATH.test(p + "/")) return -1;
  const segs = p.split("/").filter(Boolean);
  if (segs.length === 0) return -1;
  const underKeywordPath = PROJECT_KEYWORDS.some((k) => segs[0] === k || segs[0].includes(k));
  if (underKeywordPath && segs.length >= 2) return 3; // /proyectos/<slug>
  if (PROJECT_KEYWORDS.some((k) => p.includes(k)) && segs.length >= 2) return 2;
  if (segs.length === 1 && /-/.test(segs[0]) && segs[0].length >= 6) return 1; // /clinica-dental-jurica
  return -1;
}

/** Extract structured portfolio projects from already-scraped site text. */
export async function extractPortfolioProjects(baseUrl: string, combinedContent: string): Promise<ExtractedPortfolioProject[]> {
  const content = (combinedContent || "").trim();
  if (content.length < 50) return [];

  const prompt = [
    "Eres un analista que extrae PROYECTOS REALES del portafolio de una agencia o profesional a partir del contenido de su sitio web.",
    `URL del sitio: ${baseUrl}`,
    "",
    fenced("CONTENIDO DEL SITIO (cada bloque empieza con su URL: '--- https://... ---')", content.slice(0, 45000)),
    "",
    "Extrae cada proyecto, caso de éxito o trabajo concreto que aparezca. Captura toda la información posible de cada uno, SOLO datos reales presentes en el texto (no inventes ni rellenes):",
    "- title: nombre del proyecto o del cliente.",
    "- client: cliente o empresa (o null).",
    "- sector: rubro o industria del cliente (o null).",
    "- description: la descripción del proyecto tal como aparece en el sitio, lo más completa posible (varias frases si las hay; no la resumas en exceso) (o null).",
    "- problem: necesidad o problema que tenía (o null).",
    "- solution: qué se construyó o el enfoque usado (o null).",
    "- services: servicios involucrados, palabras simples (o lista vacía).",
    "- stack: tecnologías o herramientas usadas (o lista vacía).",
    "- result: resultado concreto logrado (o null).",
    "- metric: una métrica titular si aparece, por ejemplo '3x tráfico' o '+40% ventas' (o null).",
    "- testimonial: cita textual de un cliente sobre el proyecto (o null).",
    "- testimonialAuthor: quién dijo esa cita (o null).",
    "- projectUrl: la URL de la página de ESE proyecto. Si un bloque '--- URL ---' trata de un único proyecto, usa esa URL; si no, el enlace a su caso o demo que aparezca (o null).",
    "- tags: 2 a 5 etiquetas libres para relacionar el proyecto con futuros clientes (o lista vacía).",
    "Un mismo proyecto puede aparecer en la lista y en su página de detalle: fúsionalos en UNA sola entrada, sin duplicar.",
    "Si el sitio no muestra proyectos concretos, devuelve una lista vacía.",
  ].join("\n");

  const res = await withRetry(
    () =>
      generateStructured<{ projects: ExtractedPortfolioProject[] }>({
        prompt,
        jsonSchema: PORTFOLIO_EXTRACT_SCHEMA,
        label: "extract-portfolio",
        maxTokens: 4000,
      }),
    { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS, label: "extract-portfolio" },
  );

  const arr = Array.isArray(res?.projects) ? res.projects : [];
  return arr.map(normalizeExtractedProject).filter((p) => p.title);
}

type ScrapedPage = { url: string; text: string; links: string[] };
type FetchOne = (url: string, maxChars: number) => Promise<ScrapedPage | null>;

/** Same-origin, hash-free, non-asset links (hrefs are already absolute from the DOM). */
function sameOriginLinks(hrefs: string[], baseUrl: string): string[] {
  let origin: string;
  try { origin = new URL(baseUrl).origin; } catch { return []; }
  const out = new Set<string>();
  for (const href of hrefs) {
    if (/^(mailto:|tel:|javascript:)/i.test(href)) continue;
    let abs: URL;
    try { abs = new URL(href); } catch { continue; }
    if (abs.origin !== origin) continue;
    abs.hash = "";
    const u = abs.toString().replace(/\/+$/, "");
    if (ASSET_EXT.test(u)) continue;
    out.add(u);
  }
  return [...out];
}

/** Bounded-concurrency map. */
async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(Math.max(1, limit), items.length || 1) }, async () => {
      while (i < items.length) {
        const idx = i++;
        out[idx] = await fn(items[idx]);
      }
    }),
  );
  return out;
}

/** Render a page in a headless browser (runs the site's JS) and read its text + links. */
async function renderPage(browser: Browser, url: string, maxChars: number): Promise<ScrapedPage | null> {
  const ctx = await browser.newContext({ userAgent: UA });
  try {
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    const data = await page.evaluate(() => ({
      title: document.title || "",
      desc: (document.querySelector('meta[name="description"]') as HTMLMetaElement | null)?.content || "",
      text: document.body ? document.body.innerText : "",
      links: Array.from(document.querySelectorAll("a[href]")).map((a) => (a as HTMLAnchorElement).href),
    }));
    const text = [data.title, data.desc, data.text]
      .filter(Boolean)
      .join("\n")
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
      .slice(0, maxChars);
    // Use the post-redirect URL (e.g. example.com → www.example.com) so same-origin
    // checks and the project URLs are correct.
    const resolved = page.url();
    return { url: resolved, text, links: sameOriginLinks(data.links, resolved) };
  } catch {
    return null;
  } finally {
    await ctx.close().catch(() => {});
  }
}

/**
 * Crawl a site for project pages: read the home page, follow it to the listing
 * sections (portfolio/about/services), then follow those to individual project
 * detail pages. `fetchOne` is either headless rendering or a raw fetch.
 */
async function crawlSite(origin: string, fetchOne: FetchOne): Promise<ScrapedPage[]> {
  const pages: ScrapedPage[] = [];
  const home = await fetchOne(origin, 14000);
  if (home) pages.push(home);

  const listingSet = new Set<string>();
  for (const l of home?.links ?? []) {
    let p = "";
    try { p = new URL(l).pathname.toLowerCase(); } catch { continue; }
    if (PROJECT_KEYWORDS.some((k) => p === `/${k}` || p.startsWith(`/${k}`)) || /\/(about|nosotros|sobre|quienes|servicios?|services?|equipo|team)/.test(p)) {
      listingSet.add(l.replace(/\/+$/, ""));
    }
  }
  for (const lp of LISTING_PATHS) listingSet.add(origin + lp);
  const homeKey = origin.replace(/\/+$/, "");
  const listingUrls = [...listingSet].filter((u) => u.replace(/\/+$/, "") !== homeKey).slice(0, 8);
  for (const pg of await mapLimit(listingUrls, 4, (u) => fetchOne(u, 12000))) if (pg) pages.push(pg);

  // Project-detail URLs found across every page rendered so far.
  const seen = new Set(pages.map((p) => p.url.replace(/\/+$/, "")));
  const scored = new Map<string, number>();
  for (const pg of pages) {
    for (const link of pg.links) {
      const key = link.replace(/\/+$/, "");
      if (seen.has(key)) continue;
      const s = projectLinkScore(link);
      if (s >= 1) scored.set(key, Math.max(scored.get(key) ?? 0, s));
    }
  }
  const detailUrls = [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([u]) => u);
  for (const pg of await mapLimit(detailUrls, 4, (u) => fetchOne(u, 6000))) if (pg) pages.push(pg);

  return pages;
}

/**
 * Discover project-detail URLs on a listing page whose cards navigate via JS
 * (onclick / router.push) instead of <a href>. Clicks each card and records the
 * URL it lands on. Best-effort: failures per card are skipped.
 */
async function discoverDetailUrlsByClicking(browser: Browser, listingUrl: string, origin: string, max = 14): Promise<string[]> {
  const ctx = await browser.newContext({ userAgent: UA, viewport: { width: 1280, height: 2200 } });
  const found = new Set<string>();
  try {
    const page = await ctx.newPage();
    await page.goto(listingUrl, { waitUntil: "domcontentloaded", timeout: 25000 });
    await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => {});
    const listingKey = page.url().replace(/\/+$/, "");
    // Origin after any redirect (→ www.), so detail URLs aren't wrongly rejected.
    let realOrigin = origin;
    try { realOrigin = new URL(page.url()).origin; } catch { /* keep origin */ }

    // Card titles parsed from the visible text: a short mixed-case line ("Doktor.mx")
    // immediately followed by its comma-separated tags ("SaaS, Healthcare, ..."). This
    // is the common card-grid shape and is sturdier than guessing the clickable element.
    const innerText: string = await page.evaluate(() => document.body?.innerText || "");
    const lines = innerText.split("\n").map((l) => l.trim()).filter(Boolean);
    const NAV = new Set(["inicio", "proyectos", "nosotros", "contacto", "menu", "cerrar", "home", "about", "contact", "projects", "portfolio", "servicios", "services"]);
    const names: string[] = [];
    const seenN = new Set<string>();
    for (let i = 0; i < lines.length - 1; i++) {
      const line = lines[i];
      if (line.length < 2 || line.length > 48) continue;
      if (!/[a-záéíóúñü]/.test(line)) continue; // must be mixed-case (a real name, not ALL-CAPS nav/tag)
      if (NAV.has(line.toLowerCase()) || /^[(©]|[)]$|^\d/.test(line)) continue;
      if (!/,/.test(lines[i + 1])) continue; // next line is the comma-separated tags
      const key = line.toLowerCase();
      if (!seenN.has(key)) {
        seenN.add(key);
        names.push(line);
      }
    }

    for (const name of names.slice(0, max)) {
      try {
        if (page.url().replace(/\/+$/, "") !== listingKey) {
          await page.goto(listingUrl, { waitUntil: "domcontentloaded", timeout: 15000 });
          await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
        }
        const loc = page.getByText(name, { exact: true }).first();
        if (!(await loc.count().catch(() => 0))) continue;
        await loc.scrollIntoViewIfNeeded().catch(() => {});
        await loc.click({ timeout: 5000 });
        await page.waitForURL((u) => u.toString().replace(/\/+$/, "") !== listingKey, { timeout: 6000 }).catch(() => {});
        const u = page.url().replace(/\/+$/, "");
        if (u !== listingKey && new URL(u).origin === realOrigin) found.add(u);
      } catch {
        /* skip this card */
      }
    }
  } catch {
    /* discovery is best-effort */
  } finally {
    await ctx.close().catch(() => {});
  }
  return [...found];
}

/** Browser crawl: render listing pages, discover detail URLs (links + JS-navigated cards), render them. */
async function crawlWithBrowser(browser: Browser, baseOrigin: string): Promise<ScrapedPage[]> {
  const pages: ScrapedPage[] = [];
  const home = await renderPage(browser, baseOrigin, 14000);
  if (home) pages.push(home);
  // Canonical origin after any redirect (e.g. → www.), used for all same-origin checks.
  let origin = baseOrigin;
  try { if (home) origin = new URL(home.url).origin; } catch { /* keep baseOrigin */ }

  const listingSet = new Set<string>();
  for (const l of home?.links ?? []) {
    let p = "";
    try { p = new URL(l).pathname.toLowerCase(); } catch { continue; }
    if (PROJECT_KEYWORDS.some((k) => p === `/${k}` || p.startsWith(`/${k}`)) || /\/(about|nosotros|sobre|quienes|servicios?|services?|equipo|team)/.test(p)) {
      listingSet.add(l.replace(/\/+$/, ""));
    }
  }
  for (const lp of LISTING_PATHS) listingSet.add(origin + lp);
  const homeKey = origin.replace(/\/+$/, "");
  const listingUrls = [...listingSet].filter((u) => u.replace(/\/+$/, "") !== homeKey).slice(0, 8);
  for (const pg of await mapLimit(listingUrls, 4, (u) => renderPage(browser, u, 12000))) if (pg) pages.push(pg);

  // Detail URLs: real <a href> links plus cards that navigate via JS onclick.
  const seen = new Set(pages.map((p) => p.url.replace(/\/+$/, "")));
  const detailSet = new Set<string>();
  for (const pg of pages) for (const link of pg.links) {
    const k = link.replace(/\/+$/, "");
    if (!seen.has(k) && projectLinkScore(link) >= 1) detailSet.add(k);
  }
  const projectListings = pages.filter((p) => {
    try { return PROJECT_KEYWORDS.some((k) => new URL(p.url).pathname.toLowerCase().includes(k)); } catch { return false; }
  });
  for (const lp of projectListings.slice(0, 2)) {
    for (const u of await discoverDetailUrlsByClicking(browser, lp.url, origin)) {
      if (!seen.has(u)) detailSet.add(u);
    }
  }

  const detailUrls = [...detailSet].slice(0, 14);
  for (const pg of await mapLimit(detailUrls, 3, (u) => renderPage(browser, u, 6000))) if (pg) pages.push(pg);
  return pages;
}

/**
 * Scrape the user's site for projects and AI-extract them. Renders pages in a
 * headless browser so JS-built sites (SPAs) expose their project list and
 * descriptions; falls back to a raw fetch if no browser is available.
 */
export async function scrapeAndExtractProjects(baseUrl: string): Promise<{ projects: ExtractedPortfolioProject[]; pagesScraped: number }> {
  let origin: string;
  try {
    origin = new URL(baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`).origin;
  } catch {
    return { projects: [], pagesScraped: 0 };
  }

  let pages: ScrapedPage[] = [];
  let browser: Browser | null = null;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (e) {
    logger.warn({ err: (e as Error).message }, "portfolio: headless browser unavailable, using raw fetch");
  }
  if (browser) {
    try {
      pages = await crawlWithBrowser(browser, origin);
    } finally {
      await browser.close().catch(() => {});
    }
  }
  // Fallback for SSR sites or when no browser/chromium is available.
  if (!pages.length) {
    pages = await crawlSite(origin, (u, max) => fetchPage(u, max));
  }

  if (!pages.length) return { projects: [], pagesScraped: 0 };
  const combined = pages.map((p) => `--- ${p.url} ---\n${p.text}`).join("\n\n");
  const projects = await extractPortfolioProjects(baseUrl, combined);
  return { projects, pagesScraped: pages.length };
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
