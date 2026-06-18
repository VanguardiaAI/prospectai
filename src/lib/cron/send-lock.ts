import { sqlite } from "@/db/connection";
import { logger } from "@/lib/logger";

// ─────────────────────────────────────────────────────────────────────────────
// Advisory send lock.
//
// The daily-cap check ("how many did I send today?") and the actual sends are
// not one atomic step, so two *concurrent* runs of the same send pass would both
// read the same count and each send up to the remaining allowance — silently
// doubling the day's volume and risking the account. That overlap is real here:
// the in-process scheduler guards itself, but the campaign "execute" endpoint
// fires sending with fire-and-forget, and the cron HTTP route can be hit
// manually — none of which coordinate.
//
// This is a single-writer mutex backed by the existing `settings` table (no
// schema change). Acquisition is one atomic SQL statement (INSERT … ON CONFLICT
// DO UPDATE … WHERE), so even simultaneous callers — in this process or another
// hitting the same SQLite file — resolve to exactly one winner. A stale lock
// (holder crashed without releasing) is reclaimable after LOCK_TTL_MS.
// ─────────────────────────────────────────────────────────────────────────────

// A full send pass staggers 30–120s between messages and can run long; the TTL
// must comfortably exceed a realistic pass so a healthy holder is never treated
// as stale. 30 min covers a maxed-out day at the slowest stagger.
const LOCK_TTL_MS = 30 * 60 * 1000;

function lockKey(name: string): string {
  return `_send_lock_${name}`;
}

/** Try to atomically take the lock. Returns the stamp held on success, else null. */
function acquire(name: string): string | null {
  const now = Date.now();
  const stamp = String(now);
  const staleBefore = now - LOCK_TTL_MS;

  // Acquire when the row is absent (INSERT), explicitly released (value = ''),
  // or stale (timestamp older than the TTL). The WHERE makes the UPDATE a no-op
  // for a fresh, held lock, so `changes` is 1 only for the single winner.
  const info = sqlite.prepare(
    `INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
     ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
     WHERE settings.value = '' OR CAST(settings.value AS INTEGER) < ?`,
  ).run(lockKey(name), stamp, staleBefore);

  return info.changes === 1 ? stamp : null;
}

/** Release the lock only if we still hold our own stamp (never clear a takeover). */
function release(name: string, stamp: string): void {
  sqlite.prepare(
    `UPDATE settings SET value = '', updated_at = datetime('now') WHERE key = ? AND value = ?`,
  ).run(lockKey(name), stamp);
}

/**
 * Run `fn` while holding the named send lock. If another run already holds it,
 * `busyResult` is returned immediately and `fn` never runs — guaranteeing the
 * daily cap can never be exceeded by overlapping passes. The lock is always
 * released, even if `fn` throws.
 */
export async function withSendLock<T>(name: string, busyResult: T, fn: () => Promise<T>): Promise<T> {
  const stamp = acquire(name);
  if (!stamp) {
    logger.warn(`[send-lock] '${name}' ya está en ejecución — se omite esta corrida para no exceder el límite`);
    return busyResult;
  }
  try {
    return await fn();
  } finally {
    release(name, stamp);
  }
}
