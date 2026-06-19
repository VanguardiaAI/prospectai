import { getSetting } from "@/db";
import { logger } from "@/lib/logger";
import { WORKANA_BASE_URL, WORKANA_INBOX_PATHS } from "./config";
import { withPage, randomDelay } from "./browser";
import { parseRelativeTime, WORKANA_DEFAULTS } from "./priority";
import type { ScrapedProject, ScrapedProfile, ScrapedInboxMessage, WorkanaSearchFilters } from "./types";

function hashId(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

function isHeadless(): boolean {
  return getSetting("workana_headless") !== "false";
}

/** Build a /jobs feed URL from saved-search filters (newest first). */
export function buildFeedUrl(filters: WorkanaSearchFilters): string {
  const u = new URL(`${WORKANA_BASE_URL}/jobs`);
  u.searchParams.set("language", "es");
  u.searchParams.set("publication_status", "all");
  if (filters.keywords) u.searchParams.set("query", filters.keywords);
  if (filters.skills?.length) u.searchParams.set("skills", filters.skills.join(","));
  if (filters.categories?.length) u.searchParams.set("category", filters.categories.join(","));
  return u.toString();
}

function extractBudget(text: string): string | null {
  // Matches "$120", "USD 300", "$300 - $500", "Menos de USD 100", etc.
  const m = text.match(/(USD|US\$|\$|€)\s?\d[\d.,]*(\s?-\s?(USD|US\$|\$|€)?\s?\d[\d.,]*)?/i);
  return m ? m[0].trim() : null;
}

function extractBids(text: string): number | null {
  // "12 propuestas" / "12 bids"
  const m = text.match(/(\d+)\s+(propuesta|propuestas|oferta|ofertas|bid|bids)/i);
  return m ? parseInt(m[1], 10) : null;
}

/** Pull the relative publish phrase from a card ("Hace 2 horas", "ayer", "há 3 dias"). */
function extractPublishedText(text: string): string | null {
  const m = text.match(
    /(?:hace|há)\s+\d+\s+(?:minutos?|min|horas?|d[ií]as?|dias?|semanas?|meses|m[eê]s(?:es)?)|ayer|yesterday|ontem/i
  );
  return m ? m[0].trim() : null;
}

/** Feed URL for a given 1-based page (page 1 omits the param). */
function feedUrlForPage(filters: WorkanaSearchFilters, page: number): string {
  const u = new URL(buildFeedUrl(filters));
  if (page > 1) u.searchParams.set("page", String(page));
  return u.toString();
}

/**
 * Scrape the project feed across several pages (newest-first), so we don't miss
 * matching projects beyond page 1. Tolerant by design: projects link to /job/<slug>,
 * so we collect those anchors and climb to the nearest card container for context.
 * Dedups by slug across pages and stops early once a page yields nothing new.
 * `rawText` drives the AI evaluation; `publishedAt` is parsed for recency ranking.
 */
export async function scrapeFeed(
  filters: WorkanaSearchFilters = {},
  maxPages: number = WORKANA_DEFAULTS.feedPages
): Promise<ScrapedProject[]> {
  return withPage(isHeadless(), async (page) => {
    const bySlug = new Map<string, ScrapedProject>();
    const pages = Math.max(1, maxPages);

    for (let pg = 1; pg <= pages; pg++) {
      const url = feedUrlForPage(filters, pg);
      logger.info({ url, page: pg }, "workana: scraping feed page");
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(2500); // let client-side rendering settle
        await randomDelay(400, 1200);
      } catch (e) {
        logger.warn({ err: (e as Error).message, page: pg }, "workana: feed page nav failed");
        break;
      }

      const raw = await page.evaluate(() => {
        const out: Array<{ slug: string; href: string; title: string; rawText: string }> = [];
        const seen = new Set<string>();
        const anchors = Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/job/"]'));
        for (const a of anchors) {
          const href = a.href;
          const slug = href.split("/job/")[1]?.split(/[?#]/)[0];
          if (!slug || seen.has(slug)) continue;
          seen.add(slug);
          const card =
            a.closest('[class*="project-item"]') ||
            a.closest('[class*="project"]') ||
            a.closest("article") ||
            a.closest("li") ||
            a.parentElement;
          const rawText = (card?.textContent || a.textContent || "").replace(/\s+/g, " ").trim();
          out.push({ slug, href, title: (a.textContent || "").replace(/\s+/g, " ").trim(), rawText });
        }
        return out;
      });

      const nowMs = Date.now();
      let newOnPage = 0;
      for (const it of raw) {
        if (bySlug.has(it.slug)) continue;
        newOnPage++;
        const publishedText = extractPublishedText(it.rawText);
        const pubMs = parseRelativeTime(publishedText, nowMs);
        bySlug.set(it.slug, {
          workanaProjectId: it.slug,
          url: it.href,
          title: it.title || it.slug,
          description: it.rawText,
          skills: [],
          budgetText: extractBudget(it.rawText),
          bidsCount: extractBids(it.rawText),
          publishedText,
          publishedAt: pubMs ? new Date(pubMs).toISOString() : null,
          rawText: it.rawText,
        });
      }
      logger.info({ page: pg, newOnPage, total: bySlug.size }, "workana: feed page scraped");
      // No new projects on this page → end of results (or a repeated last page).
      if (newOnPage === 0) break;
    }

    const projects = Array.from(bySlug.values());
    logger.info({ count: projects.length }, "workana: feed scraped");
    return projects;
  });
}

/** Scrape a single project's detail page for the full brief + skills. */
export async function scrapeProjectDetail(url: string): Promise<ScrapedProject | null> {
  return withPage(isHeadless(), async (page) => {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(1500);
      const data = await page.evaluate(() => {
        const text = (sel: string) => document.querySelector(sel)?.textContent?.replace(/\s+/g, " ").trim() || "";
        const title = text("h1") || document.title;
        const body = (document.querySelector("main") || document.body).textContent?.replace(/\s+/g, " ").trim() || "";
        const skills = Array.from(document.querySelectorAll('[class*="skill"] a, [class*="tag"] a, a[href*="/jobs?skills"]'))
          .map((s) => s.textContent?.trim() || "")
          .filter(Boolean);
        return { title, body, skills };
      });
      const slug = url.split("/job/")[1]?.split(/[?#]/)[0] || url;
      return {
        workanaProjectId: slug,
        url,
        title: data.title,
        description: data.body,
        skills: Array.from(new Set(data.skills)),
        budgetText: extractBudget(data.body),
        bidsCount: extractBids(data.body),
        publishedText: null,
        rawText: data.body,
      };
    } catch (e) {
      logger.warn({ err: (e as Error).message, url }, "workana: scrapeProjectDetail failed");
      return null;
    }
  });
}

/**
 * Scrape the logged-in freelancer profile to seed an agency_profile. Requires an
 * authenticated session; returns null if not logged in / page unreadable.
 */
export async function scrapeProfile(profileUrl?: string): Promise<ScrapedProfile | null> {
  const url = profileUrl || getSetting("workana_profile_url") || "";
  if (!url) return null;
  return withPage(isHeadless(), async (page) => {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
      await page.waitForTimeout(1500);
      const data = await page.evaluate(() => {
        const t = (sel: string) => document.querySelector(sel)?.textContent?.replace(/\s+/g, " ").trim() || "";
        const name = t("h1");
        const title = t('[class*="headline"]') || t('[class*="title"]');
        const bio = t('[class*="about"]') || t('[class*="bio"]') || t('[class*="description"]');
        const skills = Array.from(document.querySelectorAll('[class*="skill"]'))
          .map((s) => s.textContent?.replace(/\s+/g, " ").trim() || "")
          .filter((s) => s && s.length < 40);
        const country = t('[class*="country"]') || t('[class*="location"]');
        const rawText = (document.querySelector("main") || document.body).textContent?.replace(/\s+/g, " ").trim() || "";
        return { name, title, bio, skills: Array.from(new Set(skills)), country, rawText };
      });
      return {
        name: data.name || null,
        title: data.title || null,
        bio: data.bio || null,
        skills: data.skills,
        country: data.country || null,
        rawText: data.rawText,
      };
    } catch (e) {
      logger.warn({ err: (e as Error).message, url }, "workana: scrapeProfile failed");
      return null;
    }
  });
}

/**
 * Scrape the client-message inbox. Requires an authenticated session. Best-effort
 * and TOLERANT: the inbox DOM is only confirmable against a real account, so this
 * collects conversation threads loosely and MUST be tuned against the live inbox.
 * Each item carries a stable `externalId` so re-scans don't duplicate.
 */
export async function scrapeInbox(): Promise<ScrapedInboxMessage[]> {
  return withPage(isHeadless(), async (page) => {
    for (const path of WORKANA_INBOX_PATHS) {
      try {
        await page.goto(`${WORKANA_BASE_URL}${path}`, { waitUntil: "domcontentloaded", timeout: 45000 });
        await page.waitForTimeout(2500);
        if (/\/login|\/signin/i.test(page.url())) continue; // not authed
        // Conversation threads link to /messages/index/<project-slug>/<user-slug>.
        const items = await page.evaluate(() => {
          const out: Array<{ href: string; title: string; text: string }> = [];
          const seen = new Set<string>();
          for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href*="/messages/index/"]'))) {
            const href = a.href;
            if (seen.has(href)) continue;
            seen.add(href);
            const li = a.closest("li") || a.parentElement;
            const text = (li?.textContent || a.textContent || "").replace(/\s+/g, " ").trim();
            out.push({ href, title: (a.textContent || "").replace(/\s+/g, " ").trim(), text });
          }
          return out;
        });
        if (!items.length) continue;
        return items.map((it) => {
          // /messages/index/<slug>/<user> → slug is the project id used across the app.
          const slug = it.href.split("/messages/index/")[1]?.split("/")[0]?.split(/[?#]/)[0] || null;
          // Container text is "<title> | <status> <time> <preview>"; keep the part after "|" as the body.
          const parts = it.text.split("|");
          const title = (parts[0] || it.title).trim();
          const body = (parts.slice(1).join("|").trim() || it.text).slice(0, 1500);
          return {
            // Dedup on the STABLE thread URL only (one row per conversation). Do NOT
            // fold in the preview/relative-time text — it changes as time ages and
            // would re-insert + re-classify the same thread on later scans.
            externalId: hashId(it.href || slug || body.slice(0, 80)),
            threadUrl: it.href,
            projectSlug: slug,
            projectTitle: title.length >= 4 ? title.slice(0, 120) : null,
            fromName: title.slice(0, 60) || null,
            body,
          };
        });
      } catch (e) {
        logger.warn({ err: (e as Error).message, path }, "workana: scrapeInbox path failed");
      }
    }
    logger.info("workana: inbox empty or not found");
    return [];
  });
}
