import { db, getSetting, setSetting } from "@/db";
import { sendingDomains } from "@/db/schema";
import { ne } from "drizzle-orm";

// ─────────────────────────────────────────────────────────────────────────────
// Absolute safety ceilings.
//
// These are the hard limits no configuration may exceed — the last line of
// defense so a typo, a bad MCP/chatbot write, or any bug can never burn an
// email domain or get a WhatsApp number banned. They are deliberately generous
// (a real single-mailbox cold-outreach setup never needs to approach them) yet
// firm enough to swallow accidental values like 100000. They are enforced in
// TWO places: when a limit setting is written (clampLimitSetting) AND when it is
// read here (every getter clamps again), so even a value that slipped into the
// DB by another path can never reach the sender un-bounded.
// ─────────────────────────────────────────────────────────────────────────────
export const ABSOLUTE_MAX_EMAIL_PER_DAY = 500;
export const ABSOLUTE_MAX_EMAIL_PER_MAILBOX = 200;
// Unofficial WhatsApp (whatsapp-web.js) bans easily; sustained cold sending well
// above the ~20/day steady cap is the main ban lever. Keep this backstop close to
// the operating range, not at carrier-tolerance levels.
export const ABSOLUTE_MAX_WA_PER_DAY = 50;

// Per-setting upper bound. Used both at write time (settings.service) and as the
// clamp ceiling at read time. Keys absent from this map are not limit settings.
export const LIMIT_SETTING_MAX: Record<string, number> = {
  global_daily_limit: ABSOLUTE_MAX_EMAIL_PER_DAY,
  warmup_start_limit: ABSOLUTE_MAX_EMAIL_PER_MAILBOX,
  warmup_increment: ABSOLUTE_MAX_EMAIL_PER_MAILBOX,
  warmup_max_limit: ABSOLUTE_MAX_EMAIL_PER_DAY,
  wa_daily_limit: ABSOLUTE_MAX_WA_PER_DAY,
  wa_warmup_start_limit: ABSOLUTE_MAX_WA_PER_DAY,
  wa_warmup_increment: ABSOLUTE_MAX_WA_PER_DAY,
  wa_warmup_max_limit: ABSOLUTE_MAX_WA_PER_DAY,
};

/** Parse a setting to an int and clamp it into [min, max]; fall back when NaN. */
function clampInt(raw: string | null, min: number, max: number, fallback: number): number {
  const n = parseInt(raw ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(n, max));
}

/** Linear warm-up ramp for a given day: start + (day-1)*increment, capped at max. */
function rampLimit(day: number, start: number, increment: number, max: number): number {
  return Math.min(start + (day - 1) * increment, max);
}

/**
 * Clamp a limit-setting value to its absolute safety ceiling before it is
 * persisted. Non-numeric values pass through untouched (other validation owns
 * those); negatives floor at 0 (0 = "paused", a valid state). This is the
 * write-time half of the defense-in-depth — the read-time getters clamp again.
 */
export function clampLimitSetting(key: string, value: string): string {
  const max = LIMIT_SETTING_MAX[key];
  if (max === undefined) return value;
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return value;
  if (n < 0) return "0";
  return n > max ? String(max) : value;
}

/**
 * Effective email daily limit. Three layers, smallest wins:
 *   1. the warm-up ramp (per-domain when sending domains exist, else global),
 *   2. the configured steady-state cap (global_daily_limit / per-domain cap),
 *   3. the absolute safety ceiling (always, even on misconfiguration).
 */
export function getEffectiveDailyLimit(): number {
  const globalLimit = clampInt(getSetting("global_daily_limit"), 0, ABSOLUTE_MAX_EMAIL_PER_DAY, 45);

  const activeDomains = db.select().from(sendingDomains)
    .where(ne(sendingDomains.status, "paused"))
    .all();

  if (activeDomains.length > 0) {
    let total = 0;
    for (const d of activeDomains) {
      const day = d.warmupDay && d.warmupDay > 0 ? d.warmupDay : 1;
      // Per-mailbox: warm-up ramp ∩ that domain's cap ∩ absolute per-mailbox ceiling.
      const perMailbox = Math.min(
        rampLimit(day, d.warmupStartLimit, d.warmupIncrement, d.dailyLimit),
        ABSOLUTE_MAX_EMAIL_PER_MAILBOX,
      );
      total += Math.max(perMailbox, 0);
    }
    return Math.min(total, globalLimit);
  }

  const warmupEnabled = getSetting("warmup_enabled") === "true";
  if (!warmupEnabled) return globalLimit;

  const day = clampInt(getSetting("warmup_day"), 1, 10000, 1);
  const startLimit = clampInt(getSetting("warmup_start_limit"), 0, ABSOLUTE_MAX_EMAIL_PER_MAILBOX, 5);
  const increment = clampInt(getSetting("warmup_increment"), 0, ABSOLUTE_MAX_EMAIL_PER_MAILBOX, 3);
  const maxLimit = clampInt(getSetting("warmup_max_limit"), 0, ABSOLUTE_MAX_EMAIL_PER_DAY, 45);

  return Math.min(rampLimit(day, startLimit, increment, maxLimit), globalLimit);
}

/**
 * Effective WhatsApp daily limit. Same shape as email: warm-up ramp ∩ the
 * configured steady-state cap (wa_daily_limit) ∩ absolute WA ceiling. WhatsApp
 * accounts (unofficial whatsapp-web.js) ban easily, so warm-up is ON by default
 * with a gentle ramp.
 */
export function getWhatsAppDailyLimit(): number {
  const cap = clampInt(getSetting("wa_daily_limit"), 0, ABSOLUTE_MAX_WA_PER_DAY, 20);

  if (getSetting("wa_warmup_enabled") !== "true") return cap;

  const day = clampInt(getSetting("wa_warmup_day"), 1, 10000, 1);
  const startLimit = clampInt(getSetting("wa_warmup_start_limit"), 0, ABSOLUTE_MAX_WA_PER_DAY, 5);
  const increment = clampInt(getSetting("wa_warmup_increment"), 0, ABSOLUTE_MAX_WA_PER_DAY, 3);
  const maxLimit = clampInt(getSetting("wa_warmup_max_limit"), 0, ABSOLUTE_MAX_WA_PER_DAY, 20);

  return Math.min(rampLimit(day, startLimit, increment, maxLimit), cap);
}

export function isWithinSendWindow(): boolean {
  const startHour = clampInt(getSetting("send_window_start"), 0, 23, 9);
  const endHour = clampInt(getSetting("send_window_end"), 1, 24, 18);
  const now = new Date();
  const hour = now.getHours();
  return hour >= startHour && hour < endHour;
}

/**
 * Advance a warm-up ramp by at most one step per *active sending day*.
 *
 * Idempotent within a calendar day (a second tick is a no-op), so the effective
 * limit never jumps mid-day. The first active day is *claimed* without a bump
 * (it is already day 1); only a later calendar day on which we send advances the
 * counter. Idle days (no sending) never advance the ramp, so reputation is built
 * on real activity rather than the clock. Call this BEFORE reading the limit.
 */
function advanceWarmup(opts: {
  enabledKey: string;
  dayKey: string;
  startKey: string;
  incKey: string;
  maxKey: string;
  lastKey: string;
  defStart: number;
  defInc: number;
  defMax: number;
  perMailboxMax: number;
}): void {
  if (getSetting(opts.enabledKey) !== "true") return;

  const today = new Date().toISOString().split("T")[0];
  const last = getSetting(opts.lastKey);
  if (last === today) return; // already handled today — keep the limit stable

  if (!last) {
    // First active sending day ever: claim day 1, do not bump.
    setSetting(opts.lastKey, today);
    return;
  }

  const currentDay = clampInt(getSetting(opts.dayKey), 1, 10000, 1);
  const start = clampInt(getSetting(opts.startKey), 0, opts.perMailboxMax, opts.defStart);
  const increment = clampInt(getSetting(opts.incKey), 0, opts.perMailboxMax, opts.defInc);
  const maxLimit = clampInt(getSetting(opts.maxKey), 0, opts.perMailboxMax, opts.defMax);

  // Stop advancing once the ramp has reached its cap.
  if (rampLimit(currentDay, start, increment, maxLimit) < maxLimit) {
    setSetting(opts.dayKey, String(currentDay + 1));
  }
  setSetting(opts.lastKey, today);
}

export function incrementWarmupDay(): void {
  advanceWarmup({
    enabledKey: "warmup_enabled",
    dayKey: "warmup_day",
    startKey: "warmup_start_limit",
    incKey: "warmup_increment",
    maxKey: "warmup_max_limit",
    lastKey: "_warmup_last_increment",
    defStart: 5,
    defInc: 3,
    defMax: 45,
    perMailboxMax: ABSOLUTE_MAX_EMAIL_PER_DAY,
  });
}

export function incrementWhatsAppWarmupDay(): void {
  advanceWarmup({
    enabledKey: "wa_warmup_enabled",
    dayKey: "wa_warmup_day",
    startKey: "wa_warmup_start_limit",
    incKey: "wa_warmup_increment",
    maxKey: "wa_warmup_max_limit",
    lastKey: "_wa_warmup_last_increment",
    defStart: 5,
    defInc: 3,
    defMax: 20,
    perMailboxMax: ABSOLUTE_MAX_WA_PER_DAY,
  });
}
