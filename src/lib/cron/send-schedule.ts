import { getSetting } from "@/db";

// ─────────────────────────────────────────────────────────────────────────────
// Scheduled sending.
//
// When a message is approved it is not sent on the next cron tick; instead it is
// stamped with a `scheduled_for` instant inside the configured daily window
// (send_window_start..send_window_end, local hours) and the senders only pick up
// rows whose time is due. By default the slot is on the NEXT day (send_next_day)
// and weekends are skipped (send_skip_weekends, roll Sat/Sun → Monday).
//
// The instant is jittered across the window — with a tail buffer so a 5-minute
// cron tick never fires after the window has closed — which, together with the
// per-message stagger in the senders, spreads volume out (healthier for a cold
// email domain / WhatsApp number than a single burst).
//
// The senders gate on TWO things (defense in depth, mirroring the warm-up
// module): `scheduled_for <= now` (both ISO-UTC, so lexicographic == chrono) AND
// isWithinSendWindow() as a hard local-hour bound.
//
// TZ assumption: the server runs in the user's timezone (self-hosted, single
// user), so the local window and the stored UTC instant line up.
// ─────────────────────────────────────────────────────────────────────────────

// Keep the latest scheduled instant this far before the window close, so the
// next 5-min cron tick is still comfortably inside the window.
const TAIL_BUFFER_MS = 10 * 60 * 1000;

function readHour(key: string, fallback: number, min: number, max: number): number {
  const n = parseInt(getSetting(key) ?? "", 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(n, max));
}

/**
 * Compute the ISO-UTC instant a freshly-approved message should be sent at.
 * `rng` is injectable for deterministic tests (defaults to Math.random).
 */
export function computeScheduledFor(now: Date = new Date(), rng: () => number = Math.random): string {
  const startHour = readHour("send_window_start", 10, 0, 23);
  let endHour = readHour("send_window_end", 12, 1, 24);
  if (endHour <= startHour) endHour = startHour + 1; // guard against bad config

  const nextDay = getSetting("send_next_day") !== "false";          // default true
  const skipWeekends = getSetting("send_skip_weekends") !== "false"; // default true

  const windowMs = (endHour - startHour) * 3_600_000;
  // Use the whole span only when the window is too short to spare the buffer.
  const span = windowMs > TAIL_BUFFER_MS * 1.5 ? windowMs - TAIL_BUFFER_MS : windowMs;

  // Place a jittered, in-window time on the given date (mutates and returns it).
  const inWindow = (d: Date): Date => {
    d.setHours(startHour, 0, 0, 0);
    d.setTime(d.getTime() + Math.floor(rng() * span));
    return d;
  };

  // Start from today's slot, then decide the day.
  let target = inWindow(new Date(now));

  if (nextDay) {
    // Always the next calendar day.
    target = new Date(now);
    target.setDate(target.getDate() + 1);
    inWindow(target);
  } else if (target.getTime() <= now.getTime()) {
    // Soonest mode: today's window already passed → roll to tomorrow.
    target.setDate(target.getDate() + 1);
    inWindow(target);
  }

  // Roll weekends forward to Monday (re-jittering on each hop).
  if (skipWeekends) {
    while (target.getDay() === 0 || target.getDay() === 6) {
      target.setDate(target.getDate() + 1);
      inWindow(target);
    }
  }

  return target.toISOString();
}
