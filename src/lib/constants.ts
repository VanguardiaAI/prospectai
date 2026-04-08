// ─── Auth ────────────────────────────────────────────────────────────
export const SESSION_DURATION_SECONDS = 7 * 24 * 60 * 60; // 7 days
export const SESSION_COOKIE_NAME = "prospect_session";
export const RATE_LIMIT_MAX_ATTEMPTS = 5;
export const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
export const RATE_LIMIT_LOCKOUT_MS = 15 * 60 * 1000; // 15 minutes

// ─── Scheduler ──────────────────────────────────────────────────────
export const SCHEDULER_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

// ─── Pagination ─────────────────────────────────────────────────────
export const MAX_PAGINATION_LIMIT = 20;

// ─── Email ──────────────────────────────────────────────────────────
export const EMAIL_GENERATION_BATCH_SIZE = 5;
export const BOUNCE_RATE_THRESHOLD = 5; // percent
export const AUTOPILOT_SEND_LIMIT = 10;
export const EMAIL_STAGGER_MIN_MS = 30_000;
export const EMAIL_STAGGER_MAX_MS = 120_000;

// ─── Defaults ───────────────────────────────────────────────────────
export const DEFAULT_QUALITY_THRESHOLD = 40;
export const DEFAULT_DAILY_LIMIT = 20;

// ─── CSV Import ─────────────────────────────────────────────────────
export const MAX_CSV_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_CSV_ROWS = 10_000;

// ─── AI ─────────────────────────────────────────────────────────────
export const GEMINI_MAX_RETRIES = 3;
export const GEMINI_BASE_DELAY_MS = 1000;

// ─── Scraping ───────────────────────────────────────────────────────
export const MAX_SCRAPE_CONTENT_LENGTH = 50_000; // chars
