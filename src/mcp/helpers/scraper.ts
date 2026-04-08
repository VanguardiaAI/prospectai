import { db, getSetting } from "@/db";
import { searchJobs } from "@/db/schema";
import { logActivity } from "@/lib/activity";

export interface SearchResult {
  success: boolean;
  searchJobId?: number;
  error?: string;
}

/**
 * Start a Google Maps search via the scraper API.
 * Returns the internal search job ID on success.
 */
export async function startGoogleMapsSearch(
  keyword: string,
  campaignId: number
): Promise<SearchResult> {
  const scraperUrl = getSetting("gmaps_scraper_url");
  if (!scraperUrl) {
    return { success: false, error: "gmaps_scraper_url not configured. Set it via update_settings." };
  }

  try {
    const formData = new URLSearchParams();
    formData.set("name", `prospectai-${Date.now()}`);
    formData.set("keywords", keyword.trim());
    formData.set("lang", "es");
    formData.set("depth", "5");
    formData.set("email", "on");
    formData.set("maxtime", "10m");
    formData.set("zoom", "15");
    formData.set("latitude", "0");
    formData.set("longitude", "0");
    formData.set("radius", "10000");

    const res = await fetch(`${scraperUrl}/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    if (!res.ok) {
      return { success: false, error: `Scraper error: HTTP ${res.status}` };
    }

    const html = await res.text();
    const match = html.match(/<td>([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})<\/td>/);

    if (!match?.[1]) {
      return { success: false, error: "Search submitted but could not parse job ID from scraper response." };
    }

    const job = db.insert(searchJobs).values({
      scraperJobId: match[1],
      keyword: keyword.trim(),
      campaignId,
      status: "pending",
    }).returning().get();

    logActivity("import", `Search started: "${keyword}"`, { campaignId, messageKey: "activityLog.searchStarted", messageVars: { keyword } });

    return { success: true, searchJobId: job.id };
  } catch (e) {
    return { success: false, error: `Search error: ${e instanceof Error ? e.message : "connection failed"}. Is the scraper running?` };
  }
}
