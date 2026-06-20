import { getSetting, setSetting } from "@/db";
import { logger } from "@/lib/logger";
import { scrapeFeed, scrapeProjectDetail } from "@/lib/workana/scraper";
import { evaluateProject, draftProposal } from "@/lib/workana/ai";
import {
  getKnownProjectIds,
  getActiveSearches,
  upsertProject,
  insertProposal,
  getDefaultProfileId,
  projectHasProposal,
  getStyleExamples,
} from "@/db/workana";
import { WORKANA_DEFAULTS, priorityScore } from "@/lib/workana/priority";
import { WORKANA_DEFAULT_FEED_SKILLS } from "@/lib/workana/config";
import type { ScrapedProject, WorkanaSearchFilters } from "@/lib/workana/types";

const DEFAULT_MAX_EVAL = WORKANA_DEFAULTS.maxEvalPerScan;
const DEFAULT_MAX_DRAFTS = WORKANA_DEFAULTS.maxDraftsPerScan;
const DEFAULT_INTERVAL_HOURS = WORKANA_DEFAULTS.scanIntervalHours;

export interface ScanOptions {
  /** Ignore the interval time-gate (manual "scan now"). */
  force?: boolean;
  maxEval?: number;
  maxDrafts?: number;
}

export interface ScanResult {
  skipped?: string;
  nextInHours?: number;
  scraped?: number;
  fresh?: number;
  evaluated?: number;
  drafted?: number;
}

function parseFilters(json: string | null): WorkanaSearchFilters {
  if (!json) return {};
  try {
    return JSON.parse(json) as WorkanaSearchFilters;
  } catch {
    return {};
  }
}

/**
 * Scan Workana: scrape the feed for each active saved search (or the general feed
 * if none), dedup against stored projects, AI-evaluate (cheap), then AI-draft the
 * top-N best-fit proposals (Opus). Drafts are stored as 'draft' for the user to
 * review/approve later — nothing is submitted here.
 */
export async function processWorkanaScans(opts: ScanOptions = {}): Promise<ScanResult> {
  if (getSetting("workana_enabled") !== "true") return { skipped: "disabled" };

  const intervalH = Number(getSetting("workana_scan_interval_hours")) || DEFAULT_INTERVAL_HOURS;
  const last = getSetting("workana_last_scan_at");
  if (!opts.force && last) {
    const elapsedH = (Date.now() - new Date(last).getTime()) / 3_600_000;
    if (elapsedH < intervalH) return { skipped: "interval", nextInHours: Number((intervalH - elapsedH).toFixed(1)) };
  }

  const maxEval = opts.maxEval ?? (Number(getSetting("workana_max_eval_per_scan")) || DEFAULT_MAX_EVAL);
  const maxDrafts = opts.maxDrafts ?? (Number(getSetting("workana_max_drafts_per_scan")) || DEFAULT_MAX_DRAFTS);
  const feedPages = Number(getSetting("workana_feed_pages")) || WORKANA_DEFAULTS.feedPages;

  // With no saved searches, scan Workana's skill-matched feed (/jobs?skills=...),
  // i.e. the "Proyectos con mis habilidades" tab — NOT the general all-categories
  // feed, which buries dev projects under writing/design/marketing gigs.
  const feedSkills = ((getSetting("workana_feed_skills") ?? "").trim() || WORKANA_DEFAULT_FEED_SKILLS)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const searches = getActiveSearches();
  const targets = searches.length
    ? searches.map((s) => ({ id: s.id as number | null, profileId: s.agencyProfileId, filters: parseFilters(s.filters) }))
    : [{ id: null as number | null, profileId: getDefaultProfileId(), filters: { skills: feedSkills } as WorkanaSearchFilters }];

  const known = getKnownProjectIds();
  let scraped = 0;
  const fresh: Array<{ p: ScrapedProject; searchId: number | null; profileId: number | null }> = [];

  for (const t of targets) {
    try {
      const projects = await scrapeFeed(t.filters, feedPages);
      scraped += projects.length;
      for (const p of projects) {
        if (known.has(p.workanaProjectId)) continue;
        known.add(p.workanaProjectId);
        fresh.push({ p, searchId: t.id, profileId: t.profileId });
      }
    } catch (e) {
      logger.warn({ err: (e as Error).message }, "workana-scan: feed scrape failed");
    }
  }

  // First-stage: evaluate (newest-first feed order), capped.
  const toEval = fresh.slice(0, maxEval);
  const evaluated: Array<{
    projectId: number;
    fitScore: number;
    shouldBid: boolean;
    p: ScrapedProject;
    profileId: number | null;
    evaluation: Awaited<ReturnType<typeof evaluateProject>>;
  }> = [];

  for (const f of toEval) {
    try {
      const evaluation = await evaluateProject(f.p, f.profileId);
      const projectId = upsertProject(f.p, evaluation, f.searchId);
      evaluated.push({ projectId, fitScore: evaluation.fitScore, shouldBid: evaluation.shouldBid, p: f.p, profileId: f.profileId, evaluation });
    } catch (e) {
      logger.warn({ err: (e as Error).message, project: f.p.workanaProjectId }, "workana-scan: evaluate failed");
    }
  }

  // Second-stage: draft the best "shouldBid" projects as a ranked pool (best +
  // reserve), highest priority first (recency + fit, not fit alone).
  const nowMs = Date.now();
  const toDraft = evaluated
    .filter((i) => i.shouldBid && !projectHasProposal(i.projectId))
    .sort(
      (a, b) =>
        priorityScore({ fitScore: b.fitScore, publishedAt: b.p.publishedAt }, nowMs) -
        priorityScore({ fitScore: a.fitScore, publishedAt: a.p.publishedAt }, nowMs)
    )
    .slice(0, maxDrafts);

  let drafted = 0;
  for (const i of toDraft) {
    try {
      // Enrich with the full brief from the detail page for a better proposal.
      const detail = await scrapeProjectDetail(i.p.url).catch(() => null);
      const source = detail && detail.rawText.length > i.p.rawText.length ? { ...i.p, ...detail } : i.p;
      // Seed with the user's own approved/sent proposals (style learning), prioritizing same-type projects.
      const examples = getStyleExamples({ skills: source.skills, excludeProjectId: i.projectId });
      const draft = await draftProposal(source, i.evaluation, i.profileId, { examples });
      insertProposal(i.projectId, i.profileId, draft, null);
      drafted++;
    } catch (e) {
      logger.warn({ err: (e as Error).message, project: i.p.workanaProjectId }, "workana-scan: draft failed");
    }
  }

  setSetting("workana_last_scan_at", new Date().toISOString());
  logger.info({ scraped, fresh: fresh.length, evaluated: evaluated.length, drafted }, "workana-scan: complete");
  return { scraped, fresh: fresh.length, evaluated: evaluated.length, drafted };
}
