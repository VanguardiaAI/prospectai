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
  /** Delivery-time estimate as free text (bid[deliveryTime]), e.g. "20 días". */
  deliveryTime?: string | null;
  /** Fill the form but DO NOT submit (verification). */
  dryRun?: boolean;
}

export interface SubmitResult {
  ok: boolean;
  ref?: string;
  error?: string;
  dryRun?: boolean;
  /** Dry-run only: whether the send button was locatable (without clicking it). */
  submitReady?: boolean;
}

async function firstVisible(page: Page, selectors: readonly string[]) {
  for (const sel of selectors) {
    const loc = page.locator(sel).first();
    if ((await loc.count().catch(() => 0)) > 0) return loc;
  }
  return null;
}

/**
 * Format the stored delivery estimate (days) as the free-text Workana expects in
 * the bid[deliveryTime] field (e.g. "20 días"), localized to the project language.
 * Returns null when there's no usable estimate (the field is then left untouched).
 * Shared by the manual submit endpoint and the auto-sender.
 */
export function formatDeliveryTime(days: number | null | undefined, language: string | null | undefined): string | null {
  if (days == null || !Number.isFinite(days) || days <= 0) return null;
  const lang = (language || "es").toLowerCase();
  const unit = lang.startsWith("en")
    ? days === 1
      ? "day"
      : "days"
    : lang.startsWith("pt")
      ? days === 1
        ? "dia"
        : "dias"
      : days === 1
        ? "día"
        : "días";
  return `${days} ${unit}`;
}

/**
 * Locate the bid form's submit button WITHOUT clicking it. Scoped to the bid form
 * so we never match the page's search/other submit. Returns the resolved (first)
 * locator, or null if no candidate is present. Shared by the real submit and the
 * dry-run readiness check, so a "fill test OK" actually confirms the send button
 * exists (the one step a fill-only dry-run could not otherwise verify).
 */
async function locateBidSubmit(page: Page) {
  const form = page.locator('form:has(textarea[name="bid[content]"])');
  let submit = form.getByRole("button", { name: /enviar|publicar|send/i });
  if ((await submit.count().catch(() => 0)) === 0) {
    submit = form.locator('button[type="submit"], input[type="submit"]').last();
  }
  return (await submit.count().catch(() => 0)) > 0 ? submit.first() : null;
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
    if (input.deliveryTime) {
      const dt = await firstVisible(page, WORKANA_SELECTORS.bidDeliveryTime);
      if (dt) {
        await dt.fill(String(input.deliveryTime));
        await randomDelay(300, 800);
      }
    }

    if (input.dryRun) {
      const filled = await cover.inputValue().catch(() => "");
      const amt = await page.locator(WORKANA_SELECTORS.bidAmount[0]).inputValue().catch(() => "");
      const dtv = await page.locator(WORKANA_SELECTORS.bidDeliveryTime[0]).inputValue().catch(() => "");
      // Also confirm the send button is locatable (without clicking it). This is the
      // only step a fill-only dry-run can't otherwise verify, so checking it here
      // turns "fill test OK" into a real green light that the actual send will work.
      const submitReady = (await locateBidSubmit(page)) != null;
      logger.info(
        { slug: input.slug, coverLen: filled.length, amount: amt, deliveryTime: dtv, submitReady },
        "workana: dry-run bid fill (NOT submitted)"
      );
      return { ok: true, dryRun: true, submitReady, ref: page.url() };
    }

    // Submit, scoped to the bid form so we never hit the page's search submit.
    await randomDelay(600, 1500);
    const submit = await locateBidSubmit(page);
    if (!submit) return { ok: false, error: "submit button not found" };
    await submit.click();

    // POSITIVE success signals — Workana confirms a sent bid in more than one way: it
    // shows a success toast ("¡Tu propuesta fue enviada con éxito!") and then may
    // redirect EITHER to the conversation thread (/messages/index/...) OR to a /plans
    // upsell. So the thread redirect alone is NOT a reliable signal (older code relied
    // on it and mis-read the toast+/plans path as a failure). Poll briefly for either.
    const SUCCESS_RE =
      /enviad[ao]\s+con\s+[ée]xito|enviada\s+com\s+sucesso|sent\s+successfully|propuesta\s+(fue|ha sido)\s+enviada|proposta\s+foi\s+enviada/i;
    let after = page.url();
    let ok = false;
    for (let i = 0; i < 12 && !ok; i++) {
      await page.waitForTimeout(1000);
      after = page.url();
      if (/\/messages\/index\//i.test(after)) {
        ok = true;
        break;
      }
      const txt = await page.locator("body").innerText({ timeout: 1500 }).catch(() => "");
      if (SUCCESS_RE.test(txt)) ok = true;
    }
    if (ok) {
      logger.info({ slug: input.slug, after }, "workana: proposal submitted");
      return { ok: true, ref: after };
    }
    if (/\/login|\/signin/i.test(after)) {
      return { ok: false, error: "session lost during submit — reconnect Workana and retry" };
    }
    const errText = await page
      .locator('.error, [class*="error"], [class*="alert"], [class*="message-error"], [class*="notification"]')
      .first()
      .innerText({ timeout: 1500 })
      .catch(() => "");
    // Belt-and-suspenders: a captured banner that is actually the success message
    // means the bid WAS sent — treat as success, never report it as a failure.
    if (SUCCESS_RE.test(errText)) {
      logger.info({ slug: input.slug, after }, "workana: proposal submitted (success banner)");
      return { ok: true, ref: after };
    }
    logger.warn({ slug: input.slug, after, errText: errText.slice(0, 200) }, "workana: submit did not complete");
    return {
      ok: false,
      error: errText ? errText.replace(/\s+/g, " ").trim().slice(0, 200) : "submission did not complete (no thread redirect)",
    };
  });
}
