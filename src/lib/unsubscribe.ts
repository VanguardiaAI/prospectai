import { db, getSetting } from "@/db";
import { unsubscribes } from "@/db/schema";
import { eq } from "drizzle-orm";
import crypto from "crypto";
import { logger } from "@/lib/logger";

/**
 * Generate an unsubscribe token for an email/lead and store it.
 * Returns the full unsubscribe URL.
 */
export function generateUnsubscribeUrl(email: string, leadId?: number): string {
  // Check if token already exists for this email
  const existing = db.select().from(unsubscribes).where(eq(unsubscribes.email, email)).get();
  if (existing) {
    return buildUrl(existing.token);
  }

  const token = crypto.randomBytes(32).toString("hex");

  db.insert(unsubscribes).values({
    email,
    token,
    leadId: leadId ?? null,
  }).run();

  return buildUrl(token);
}

function buildUrl(token: string): string {
  const customUrl = getSetting("unsubscribe_url");
  if (customUrl) {
    const sep = customUrl.includes("?") ? "&" : "?";
    return `${customUrl}${sep}token=${token}`;
  }
  // Use tracking_base_url for absolute URL (required for email clients)
  const baseUrl = getSetting("tracking_base_url") || "";
  if (!baseUrl) {
    logger.warn("[unsubscribe] No tracking_base_url configured — unsubscribe links will be broken in emails. Set tracking_base_url in settings.");
  }
  return `${baseUrl}/api/unsubscribe?token=${token}`;
}

/**
 * Inject a visible unsubscribe link into the email HTML body.
 */
export function injectUnsubscribeLink(html: string, unsubscribeUrl: string): string {
  const linkHtml = `<div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;font-size:12px;color:#999;text-align:center;">Si no deseas recibir más comunicaciones, puedes <a href="${unsubscribeUrl}" style="color:#999;text-decoration:underline;">darte de baja aquí</a>.</div>`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${linkHtml}</body>`);
  }
  return html + linkHtml;
}

/**
 * Append unsubscribe notice to plain text version.
 */
export function appendUnsubscribeText(text: string, unsubscribeUrl: string): string {
  return `${text}\n\n---\nSi no deseas recibir más comunicaciones: ${unsubscribeUrl}`;
}

/**
 * Check if an email has been unsubscribed.
 */
export function isUnsubscribed(email: string): boolean {
  const record = db.select().from(unsubscribes)
    .where(eq(unsubscribes.email, email))
    .get();
  return !!record?.unsubscribedAt;
}
