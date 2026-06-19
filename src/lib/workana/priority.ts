/**
 * Workana Professional-plan defaults + the recency-aware ranking used to decide
 * which proposals to send first (and which projects to draft). Centralized so the
 * scanner, the auto-sender and the review UI all rank the same way: freshest +
 * best-fit first, without ever discarding recent-but-not-newest good matches.
 */

const HOUR_MS = 3_600_000;

/** Plan defaults — each is overridable via the matching `workana_*` setting. */
export const WORKANA_DEFAULTS = {
  /** Professional plan: up to 17 connections/week. */
  weeklyConnections: 17,
  /** Minimum gap between two real sends (so two offers never go out together). */
  minSendIntervalMinutes: 20,
  /** Feed pages to paginate per search (newest-first recency window). */
  feedPages: 4,
  /** Cheap first-stage AI evaluations per scan (cover the recency window). */
  maxEvalPerScan: 60,
  /** Drafts generated per scan — a ranked pool (best + reserve), not just the top few. */
  maxDraftsPerScan: 12,
  /** Auto-scan cadence. */
  scanIntervalHours: 6,
  /** Optional soft daily cap (0 = no cap; weekly budget + spacing govern the pace). */
  maxSendsPerDay: 0,
} as const;

/**
 * Parse a Workana relative-time string ("hace 3 horas", "ayer", "há 2 dias",
 * "2 days ago") into an epoch-ms estimate, relative to `nowMs`. Returns null when
 * unrecognized so callers can fall back to first-seen time.
 */
export function parseRelativeTime(text: string | null | undefined, nowMs: number): number | null {
  if (!text) return null;
  const t = text.toLowerCase();
  if (/\bayer\b|\byesterday\b|\bontem\b/.test(t)) return nowMs - 24 * HOUR_MS;
  if (/hace\s+un?\s+momento|just now|moments?\s+ago|agora\s+mesmo/.test(t)) return nowMs - 60_000;
  const m = t.match(/(\d+)\s*(minuto|minute|min|hora|hour|hr|d[ií]a|dia|day|semana|week|mes|month|m[eê]s)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  const unit = m[2];
  let ms = 0;
  if (/^min/.test(unit) || unit === "minuto" || unit === "minute") ms = n * 60_000;
  else if (/^(hora|hour|hr)/.test(unit)) ms = n * HOUR_MS;
  else if (/^(d[ií]a|dia|day)/.test(unit)) ms = n * 24 * HOUR_MS;
  else if (/^(semana|week)/.test(unit)) ms = n * 7 * 24 * HOUR_MS;
  else if (/^(mes|month|m[eê]s)/.test(unit)) ms = n * 30 * 24 * HOUR_MS;
  else return null;
  return nowMs - ms;
}

/**
 * Recency bonus added on top of fit: fresher projects rank higher, but an
 * older-yet-recent high-fit project stays competitive (we never drop recent
 * offers from previous days). Unknown age gets a small neutral bonus.
 */
export function recencyBonus(ageHours: number): number {
  if (!Number.isFinite(ageHours) || ageHours < 0) return 6;
  if (ageHours < 12) return 20;
  if (ageHours < 24) return 14;
  if (ageHours < 48) return 8;
  if (ageHours < 72) return 3;
  return 0;
}

export interface RankInput {
  fitScore?: number | null;
  confidence?: number | null;
  /** ISO timestamp the project was published (preferred) or first seen. */
  publishedAt?: string | null;
  /** Fallback ISO timestamp (e.g. when the row was created). */
  createdAt?: string | null;
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, Number.isFinite(n) ? n : lo));
}

/**
 * Combined send/draft priority: fit dominates, recency is a strong boost, draft
 * confidence is a light tiebreaker. Higher = send/draft sooner.
 */
export function priorityScore(input: RankInput, nowMs: number): number {
  const fit = clamp(input.fitScore ?? 50, 0, 100);
  const conf = clamp(input.confidence ?? 50, 0, 100);
  const tsRaw = input.publishedAt || input.createdAt || null;
  const ts = tsRaw ? Date.parse(tsRaw) : NaN;
  const ageHours = Number.isFinite(ts) ? (nowMs - ts) / HOUR_MS : NaN;
  return fit + recencyBonus(ageHours) + conf * 0.1;
}
