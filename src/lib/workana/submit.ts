import type { Page } from "playwright";
import { getSetting } from "@/db";
import { logger } from "@/lib/logger";
import { withPage, randomDelay } from "./browser";
import { WORKANA_SELECTORS, workanaBidUrl } from "./config";

export interface SubmitInput {
  /** Workana project slug (== workana_projects.workanaProjectId). */
  slug: string;
  coverLetter: string;
  bidAmount: number | null;
  /** Estimated work hours (bid[hours]); optional — Workana asks it for some projects. */
  hours?: number | null;
  /** Fill the form but DO NOT submit (verification). */
  dryRun?: boolean;
}

export interface SubmitResult {
  ok: boolean;
  ref?: string;
  error?: string;
  dryRun?: boolean;
}

async function firstVisible(page: Page, selectors: readonly string[]) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count().catch(() => 0)) > 0) return loc;
  }
  return null;
}

/**
 * Fill and submit a Workana proposal at /messages/bid/<slug> (human pacing).
 * Selectors confirmed against the real form: textarea[name="bid[content]"],
 * input[name="bid[amount]"]. CSRF tokens are hidden inputs already in the page,
 * so submitting the real form carries them.
 *
 * HARD-GATED behind `workana_allow_submit` (default "false") — throws unless the
 * user has explicitly enabled real sending. Pass `dryRun` to fill without submitting.
 */
export async function submitProposal(input: SubmitInput): Promise<SubmitResult> {
  // Dry-run only fills the form (safe), so it bypasses the gate. A REAL submit
  // requires the user to have explicitly enabled sending.
  if (!input.dryRun && getSetting("workana_allow_submit") !== "true") {
    throw new Error("workana submit disabled — enable it (workana_allow_submit) to send for real");
  }
  const headless = getSetting("workana_headless") !== "false";
  return withPage(headless, async (page) => {
    await page.goto(workanaBidUrl(input.slug), { waitUntil: "domcontentloaded", timeout: 45000 });
    await randomDelay(800, 2000);
    if (/\/login|\/signin/i.test(page.url())) return { ok: false, error: "not_logged_in" };

    const cover = await firstVisible(page, WORKANA_SELECTORS.bidCoverLetter);
    if (!cover) return { ok: false, error: "bid form not found (cover letter field missing)" };

    await cover.click();
    await cover.fill(""); // clear any prefilled text
    for (const ch of input.coverLetter) {
      await page.keyboard.type(ch, { delay: 35 + Math.random() * 70 });
    }

    if (input.bidAmount != null) {
      const amt = await firstVisible(page, WORKANA_SELECTORS.bidAmount);
      if (amt) {
        await amt.fill(String(input.bidAmount));
        await randomDelay(300, 800);
      }
    }
    if (input.hours != null) {
      const hrs = await firstVisible(page, WORKANA_SELECTORS.bidHours);
      if (hrs) {
        await hrs.fill(String(input.hours));
        await randomDelay(300, 800);
      }
    }

    if (input.dryRun) {
      const filled = await cover.inputValue().catch(() => "");
      const amt = await page.locator(WORKANA_SELECTORS.bidAmount[0]).inputValue().catch(() => "");
      logger.info({ slug: input.slug, coverLen: filled.length, amount: amt }, "workana: dry-run bid fill (NOT submitted)");
      return { ok: true, dryRun: true, ref: page.url() };
    }

    // Submit, scoped to the bid form so we never hit the page's search submit.
    await randomDelay(600, 1500);
    const form = page.locator('form:has(textarea[name="bid[content]"])');
    let submit = form.getByRole("button", { name: /enviar|publicar|send/i });
    if ((await submit.count().catch(() => 0)) === 0) {
      submit = form.locator('button[type="submit"], input[type="submit"]').last();
    }
    if ((await submit.count().catch(() => 0)) === 0) return { ok: false, error: "submit button not found" };
    await submit.first().click();
    await page.waitForTimeout(3000);

    logger.info({ slug: input.slug, url: page.url() }, "workana: proposal submitted");
    return { ok: true, ref: page.url() };
  });
}
