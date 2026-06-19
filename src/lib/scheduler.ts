// Internal cron scheduler — self-triggers /api/cron at a configurable interval.
// Starts once on first import; runs in the Node.js process.

import { logger } from "@/lib/logger";

let started = false;
let intervalId: ReturnType<typeof setInterval> | null = null;
let running = false;

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function startScheduler() {
  if (started) return;
  started = true;

  const intervalMs = parseInt(process.env.CRON_INTERVAL_MS || "", 10) || DEFAULT_INTERVAL_MS;
  const cronSecret = process.env.CRON_SECRET || "";
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || process.env.VERCEL_URL || "http://localhost:3000";

  logger.info(`[Scheduler] Starting — interval: ${intervalMs / 1000}s`);

  async function tick() {
    if (running) return;
    running = true;
    try {
      const url = `${baseUrl}/api/cron?action=all`;
      await fetch(url, {
        method: "POST",
        // The proxy (middleware) only accepts `Authorization: Bearer <secret>` or a
        // session cookie for /api/cron; a bare `x-cron-secret` header is rejected
        // there before the route runs. Send Bearer (passes the proxy AND the route);
        // keep x-cron-secret too as a harmless fallback.
        headers: { authorization: `Bearer ${cronSecret}`, "x-cron-secret": cronSecret },
      });
    } catch (err) {
      logger.error({ err: err instanceof Error ? err.message : err }, "[Scheduler] Cron tick failed");
    } finally {
      running = false;
    }
  }

  intervalId = setInterval(tick, intervalMs);

  // Run immediately on start
  setTimeout(tick, 10_000);
}

export function stopScheduler() {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }
  started = false;
}

export function isSchedulerRunning() {
  return started;
}
