import { db, getSetting } from "@/db";
import { searchJobs } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { NotFoundError } from "./errors";

// ─── Types ──────────────────────────────────────────────────────────

export interface StartSearchInput {
  keyword: string;
  campaignId?: number;
  maxDepth?: number;
}

export interface ScraperError extends Error {
  statusCode: number;
}

// ─── Service Functions ──────────────────────────────────────────────

export function listSearchJobs() {
  return db
    .select({
      id: searchJobs.id,
      scraperJobId: searchJobs.scraperJobId,
      keyword: searchJobs.keyword,
      campaignId: searchJobs.campaignId,
      status: searchJobs.status,
      resultCount: searchJobs.resultCount,
      error: searchJobs.error,
      createdAt: searchJobs.createdAt,
      completedAt: searchJobs.completedAt,
    })
    .from(searchJobs)
    .orderBy(desc(searchJobs.createdAt))
    .limit(50)
    .all();
}

export function getSearchJob(id: number) {
  const job = db.select().from(searchJobs).where(eq(searchJobs.id, id)).get();
  if (!job) throw new NotFoundError("Search job", id);
  return job;
}

export async function startSearch(input: StartSearchInput) {
  const { keyword, campaignId, maxDepth = 12 } = input;
  const scraperUrl = getSetting("gmaps_scraper_url") || "http://localhost:8081";

  const formData = new URLSearchParams();
  formData.set("name", `prospectai-${Date.now()}`);
  formData.set("keywords", keyword.trim());
  formData.set("lang", "es");
  formData.set("depth", String(Math.min(Math.max(maxDepth, 1), 100)));
  formData.set("email", "on");
  formData.set("maxtime", "15m");
  formData.set("zoom", "15");
  formData.set("latitude", "0");
  formData.set("longitude", "0");
  formData.set("radius", "10000");

  let scraperRes: Response;
  try {
    scraperRes = await fetch(`${scraperUrl}/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message.includes("fetch failed") || message.includes("ECONNREFUSED")) {
      const e = new Error("No se pudo conectar con el scraper. Verifica que Docker esté corriendo.") as ScraperError;
      e.statusCode = 502;
      throw e;
    }
    throw err;
  }

  if (!scraperRes.ok) {
    const errBody = await scraperRes.text();
    const e = new Error(`Error del scraper: ${scraperRes.status} - ${errBody}`) as ScraperError;
    e.statusCode = 502;
    throw e;
  }

  // Parse job UUID from HTMX HTML response
  const responseHtml = await scraperRes.text();
  const match = responseHtml.match(/<td>([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})<\/td>/);
  const scraperJobId = match?.[1];

  if (!scraperJobId) {
    const e = new Error("No se pudo obtener el ID del job del scraper") as ScraperError;
    e.statusCode = 502;
    throw e;
  }

  // Save search job to database
  const job = db.insert(searchJobs).values({
    scraperJobId,
    keyword: keyword.trim(),
    campaignId: campaignId ? Number(campaignId) : null,
    status: "pending",
  }).returning().get();

  logActivity("import", `Búsqueda iniciada: "${keyword.trim()}"`, {
    campaignId: campaignId ? Number(campaignId) : undefined,
    metadata: { searchJobId: job.id, scraperJobId },
    messageKey: "activityLog.searchStarted",
    messageVars: { keyword: keyword.trim() },
  });

  return job;
}
