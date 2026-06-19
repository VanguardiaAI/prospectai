/**
 * Next.js boot hook — `register()` runs once when the server process starts.
 *
 * We use it to auto-start the internal cron scheduler so background jobs (email /
 * WhatsApp / Workana sending, scans, replies) run whenever the server is up and
 * survive launchd/KeepAlive restarts. Previously the scheduler only started from a
 * manual toggle in Settings, so every restart silently stopped ALL automation until
 * someone re-enabled it — which would also strand the Workana auto-sender.
 *
 * This is safe: it only TICKS the cron. Each job self-gates on its own flags —
 * email sends only already-approved+due mail within the send window, the Workana
 * auto-sender only approved proposals with budget/interval left, etc. — so nothing
 * goes out that the user hasn't already enabled. The scheduler can still be stopped
 * from Settings.
 */
export async function register() {
  // Only run in the Node.js server runtime (not Edge), and never during build.
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  try {
    const { getSetting } = await import("@/db");
    // Opt-in only: the engine auto-starts on boot ONLY when the user has turned it
    // on. Default off so a restart never silently resumes sending (email/WhatsApp/
    // Workana). The user enables this once they want always-on automation.
    if (getSetting("scheduler_autostart") !== "true") return;
    const { startScheduler } = await import("@/lib/scheduler");
    startScheduler();
  } catch (err) {
    // Never let a scheduler hiccup block the server from starting.
    const { logger } = await import("@/lib/logger");
    logger.error({ err: err instanceof Error ? err.message : err }, "[instrumentation] startScheduler failed");
  }
}
