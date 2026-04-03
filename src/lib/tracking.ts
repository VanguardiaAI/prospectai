import { getSetting } from "@/db";

/**
 * Inject open tracking pixel into email HTML before </body>
 */
export function injectTrackingPixel(html: string, emailId: number): string {
  const baseUrl = getSetting("tracking_base_url") || getSetting("unsubscribe_url")?.replace(/\/api\/.*$/, "") || "";
  if (!baseUrl) {
    console.warn("[tracking] tracking_base_url no configurada — pixel de apertura no inyectado para email", emailId);
    return html;
  }

  const pixelUrl = `${baseUrl}/api/track/open?id=${emailId}`;
  const pixel = `<img src="${pixelUrl}" width="1" height="1" style="display:none" alt="" />`;

  if (html.includes("</body>")) {
    return html.replace("</body>", `${pixel}</body>`);
  }
  return html + pixel;
}

/**
 * Replace URLs in HTML with click tracking URLs
 */
export function wrapLinksWithTracking(html: string, emailId: number): string {
  const baseUrl = getSetting("tracking_base_url") || getSetting("unsubscribe_url")?.replace(/\/api\/.*$/, "") || "";
  if (!baseUrl) {
    console.warn("[tracking] tracking_base_url no configurada — links sin wrapping de tracking para email", emailId);
    return html;
  }

  // Replace href URLs (skip mailto:, tel:, unsubscribe, and tracking URLs)
  return html.replace(
    /href="(https?:\/\/[^"]+)"/g,
    (match, url) => {
      // Don't wrap unsubscribe links or tracking links themselves
      if (url.includes("/api/track/") || url.includes("/api/unsubscribe")) {
        return match;
      }
      const trackUrl = `${baseUrl}/api/track/click?id=${emailId}&url=${encodeURIComponent(url)}`;
      return `href="${trackUrl}"`;
    }
  );
}
