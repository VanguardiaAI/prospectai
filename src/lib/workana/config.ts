import path from "node:path";

export const WORKANA_BASE_URL = "https://www.workana.com";

/**
 * Persistent browser profile (cookies + localStorage). Holds the live login
 * session, so it is a credential — gitignored (see .gitignore) and 0700.
 */
export const WORKANA_USER_DATA_DIR = path.join(process.cwd(), "data", "workana-profile");

export const WORKANA_LOGIN_URL = `${WORKANA_BASE_URL}/login`;

/**
 * Member-only paths used to detect auth: a guest hitting these is redirected to
 * the login page, which is the most robust (selector-independent) signal.
 * `/inbox` is confirmed member-only (the messages inbox).
 */
export const WORKANA_PROTECTED_PATHS = ["/inbox", "/dashboard"];

/** The message inbox (lists conversation threads). `/users/messages` redirects to `/inbox`. */
export const WORKANA_INBOX_PATHS = ["/users/messages", "/inbox"];

/**
 * Tunable selectors. Workana has no public API and the authed DOM can only be
 * confirmed against a real session, so these are best-effort and isolated here
 * for easy refinement in later phases. Each entry is a list of candidates tried
 * in order.
 */
export const WORKANA_SELECTORS = {
  loginForm: ['input[type="password"]'],
  remainingConnections: ['[class*="connection"]', '[class*="bid-credit"]', '[data-connections]'],
  // Project feed cards link to /job/<slug>; we also climb to a card container.
  projectLink: ['a[href*="/job/"]'],
  projectCard: ['[class*="project-item"]', '[class*="project"]', "article", "li"],
  // Bid form at /messages/bid/<slug> — confirmed against the real DOM (2026-06).
  bidCoverLetter: ['textarea[name="bid[content]"]', "#BidContent"],
  bidAmount: ['input[name="bid[amount]"]', "#Amount"],
  bidHours: ['input[name="bid[hours]"]', "#Hours"],
  // Free-text delivery estimate ("Ejemplo: 2 días o 3 horas"). Not HTML-required,
  // but Workana validates it on submit, so we fill it from the proposal estimate.
  bidDeliveryTime: ['input[name="bid[deliveryTime]"]', "#DeliveryTime"],
  bidSubmit: ['button[type="submit"]', 'input[type="submit"]'],
} as const;

/** Bid form URL for a project slug. */
export const workanaBidUrl = (slug: string) => `${WORKANA_BASE_URL}/messages/bid/${slug}`;
