import { chromium, type BrowserContext, type Page } from "playwright";
import { getSetting } from "@/db";
import { logger } from "@/lib/logger";
import { WORKANA_BASE_URL, WORKANA_USER_DATA_DIR, WORKANA_PROTECTED_PATHS } from "./config";

const DEFAULT_UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Persist the persistent-context across Next.js dev hot-reloads (same rationale
 * as whatsapp-client.ts): without this, a module re-evaluation drops the JS
 * reference while the Chromium process keeps holding the userDataDir lock, so
 * the next launch collides on the profile. One context per process, max.
 */
interface WorkanaBrowserGlobal {
  context: BrowserContext | null;
  headless: boolean | null;
  launching: Promise<BrowserContext> | null;
}
const globalForWorkana = globalThis as unknown as { __prospectaiWorkanaBrowser?: WorkanaBrowserGlobal };
const wb: WorkanaBrowserGlobal =
  globalForWorkana.__prospectaiWorkanaBrowser ??
  (globalForWorkana.__prospectaiWorkanaBrowser = { context: null, headless: null, launching: null });

/**
 * Minimal, proportionate stealth. Workana sits on GCP with no Cloudflare WAF, so
 * we only patch the most obvious headless tells and deliberately avoid the heavy
 * (and stale) stealth plugin. Escalate only if detection ever appears.
 */
const STEALTH_INIT = `
  Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
  window.chrome = window.chrome || { runtime: {} };
  Object.defineProperty(navigator, 'languages', { get: () => ['es-AR', 'es', 'en'] });
  Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] });
`;

function launchOptions(headless: boolean) {
  return {
    headless,
    locale: getSetting("workana_locale") || "es-AR",
    timezoneId: getSetting("workana_timezone") || "America/Argentina/Buenos_Aires",
    viewport: { width: 1366, height: 768 },
    userAgent: DEFAULT_UA,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-blink-features=AutomationControlled",
    ],
  };
}

async function doLaunch(headless: boolean): Promise<BrowserContext> {
  logger.info({ headless, userDataDir: WORKANA_USER_DATA_DIR }, "workana: launching persistent context");
  const context = await chromium.launchPersistentContext(WORKANA_USER_DATA_DIR, launchOptions(headless));
  await context.addInitScript(STEALTH_INIT);
  wb.context = context;
  wb.headless = headless;
  context.once("close", () => {
    if (wb.context === context) {
      wb.context = null;
      wb.headless = null;
    }
  });
  return context;
}

/**
 * Get the shared persistent context. A persistent context cannot switch headless
 * mode in-place, so if the requested mode differs from the running one we close
 * and relaunch (only one context may hold the userDataDir at a time).
 */
export async function getContext(headless: boolean): Promise<BrowserContext> {
  if (wb.context && wb.headless === headless) return wb.context;
  if (wb.context && wb.headless !== headless) await closeContext();
  if (wb.launching) return wb.launching;
  wb.launching = doLaunch(headless).finally(() => {
    wb.launching = null;
  });
  return wb.launching;
}

export async function closeContext(): Promise<void> {
  const ctx = wb.context;
  wb.context = null;
  wb.headless = null;
  if (ctx) {
    try {
      await ctx.close();
    } catch {
      /* already closed */
    }
  }
}

/** Run `fn` with a fresh page in the shared context, always closing the page. */
export async function withPage<T>(headless: boolean, fn: (page: Page) => Promise<T>): Promise<T> {
  const ctx = await getContext(headless);
  const page = await ctx.newPage();
  try {
    return await fn(page);
  } finally {
    try {
      await page.close();
    } catch {
      /* page already gone */
    }
  }
}

/**
 * Whether the current session is authenticated. Robust + selector-independent:
 * navigate to a member-only path and check whether we were bounced to login.
 * `page` should be a throwaway page (it gets navigated).
 */
export async function assertLoggedIn(page: Page): Promise<boolean> {
  for (const path of WORKANA_PROTECTED_PATHS) {
    try {
      await page.goto(`${WORKANA_BASE_URL}${path}`, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.waitForTimeout(700);
      const url = page.url();
      if (/\/login|\/signin|\/users\/login/i.test(url)) return false;
      // On a protected page that didn't redirect → authenticated.
      return true;
    } catch (e) {
      logger.warn({ err: (e as Error).message, path }, "workana: assertLoggedIn nav failed, trying next path");
    }
  }
  return false;
}

/** Best-effort read of the remaining weekly Connections counter (null if unknown). */
export async function getRemainingConnections(page: Page): Promise<number | null> {
  const { WORKANA_SELECTORS } = await import("./config");
  for (const sel of WORKANA_SELECTORS.remainingConnections) {
    try {
      const text = await page.locator(sel).first().innerText({ timeout: 2500 });
      const m = text.match(/\d+/);
      if (m) return parseInt(m[0], 10);
    } catch {
      /* try next selector */
    }
  }
  return null;
}

/** One-shot auth probe on the shared context (reuses it, no extra launch). */
export async function probeLoggedIn(): Promise<boolean> {
  const headless = getSetting("workana_headless") !== "false";
  return withPage(headless, (page) => assertLoggedIn(page)).catch(() => false);
}

/** Human-ish pause between actions (anti-detection pacing). */
export function randomDelay(minMs = 300, maxMs = 1500): Promise<void> {
  const ms = Math.floor(minMs + (maxMs - minMs) * Math.random());
  return new Promise((r) => setTimeout(r, ms));
}

/** Type into a field with human-like per-character delay. */
export async function humanType(page: Page, selector: string, text: string): Promise<void> {
  await page.locator(selector).click();
  for (const ch of text) {
    await page.keyboard.type(ch, { delay: 60 + Math.random() * 90 });
  }
}
