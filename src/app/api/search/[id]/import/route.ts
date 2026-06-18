import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { searchJobs, leads, blacklist, jobQueue } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { validateBody, importSearchResultsSchema } from "@/lib/validations";
import { isContactEmail } from "@/lib/scraper";

interface PlaceResult {
  title?: string;
  category?: string;
  phone?: string;
  website?: string;
  address?: string;
  complete_address?: string;
  link?: string;
  review_count?: string;
  review_rating?: string;
  latitude?: string;
  longitude?: string;
  emails?: string;
}

function extractCityState(completeAddress: string | undefined, plainAddress: string | undefined): { city: string | null; state: string | null } {
  // Try parsing complete_address as JSON first (google-maps-scraper format)
  if (completeAddress) {
    try {
      const parsed = JSON.parse(completeAddress);
      if (parsed.city || parsed.state) {
        return { city: parsed.city || null, state: parsed.state || null };
      }
    } catch {
      // Not JSON, try comma-separated parsing
    }
  }

  // Fallback: parse from plain address string
  const addr = completeAddress || plainAddress;
  if (!addr) return { city: null, state: null };

  const parts = addr.split(",").map((p) => p.trim());
  if (parts.length >= 3) {
    const lastPart = parts[parts.length - 1];
    const isCountry = /m[eé]xico|mexico|mx/i.test(lastPart);
    const offset = isCountry ? 2 : 1;
    const statePart = parts[parts.length - offset]?.replace(/\d{5}/, "").trim() || null;
    const cityPart = parts[parts.length - offset - 1]?.replace(/\d{5}/, "").trim() || null;
    return { city: cityPart, state: statePart };
  }

  return { city: null, state: null };
}

function parseEmails(emailsStr: string | undefined): string[] {
  if (!emailsStr || emailsStr === "[]") return [];
  let candidates: string[] = [];
  try {
    // Could be a JSON array string like ["email@example.com"]
    const parsed = JSON.parse(emailsStr);
    if (Array.isArray(parsed)) candidates = parsed.map(String);
    else if (typeof parsed === "string") candidates = [parsed];
  } catch {
    // Could be comma-separated or a single email
    candidates = [emailsStr];
  }
  // The Google Maps scraper emits emails from the same loose regex our own scraper
  // used to, so a single field can hold several addresses joined by commas AND
  // asset filenames like `bg-info@2x.png`. Split on separators and drop anything
  // that isn't a real contact address (see isContactEmail) before it reaches
  // leads.email — otherwise those false positives become the lead's send target.
  return [
    ...new Set(
      candidates
        .flatMap((c) => c.split(/[\s,;]+/))
        .map((e) => e.trim())
        .filter((e) => e.includes("@") && isContactEmail(e))
    ),
  ];
}

// POST: Import selected results as leads
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const jobId = Number(id);
    const body = await req.json();
    const v = validateBody(importSearchResultsSchema, body);
    if (!v.success) return v.response;
    const { selectedIndices, campaignId: overrideCampaignId } = v.data;

    const job = db.select().from(searchJobs).where(eq(searchJobs.id, jobId)).get();
    if (!job) {
      return NextResponse.json({ error: "Búsqueda no encontrada" }, { status: 404 });
    }

    if (job.status !== "completed" || !job.results) {
      return NextResponse.json({ error: "La búsqueda aún no tiene resultados" }, { status: 400 });
    }

    const results: PlaceResult[] = JSON.parse(job.results);
    const campaignId = overrideCampaignId ? Number(overrideCampaignId) : job.campaignId;

    // Determine which results to import
    const toImport = Array.isArray(selectedIndices)
      ? selectedIndices.map((i: number) => results[i]).filter(Boolean)
      : results;

    // Get blacklist
    const blacklisted = db.select().from(blacklist).all();
    const blacklistSet = new Set(blacklisted.map((b) => b.value.toLowerCase()));

    let imported = 0;
    let skippedBlacklist = 0;
    let skippedNoName = 0;

    for (const place of toImport) {
      if (!place.title) {
        skippedNoName++;
        continue;
      }

      // Check blacklist
      let domain: string | null = null;
      if (place.website) {
        try {
          const url = place.website.startsWith("http") ? place.website : `https://${place.website}`;
          domain = new URL(url).hostname.replace("www.", "");
        } catch { /* invalid URL */ }
      }

      if (domain && blacklistSet.has(domain)) {
        skippedBlacklist++;
        continue;
      }

      const emails = parseEmails(place.emails);
      const email = emails[0] || null;
      if (email && blacklistSet.has(email.toLowerCase())) {
        skippedBlacklist++;
        continue;
      }

      // Extract city and state from complete_address (real Google Maps data)
      const { city, state } = extractCityState(place.complete_address, place.address);

      const lead = db.insert(leads).values({
        campaignId: campaignId || null,
        name: place.title,
        category: place.category || null,
        phone: place.phone || null,
        email,
        website: place.website || null,
        address: place.complete_address || place.address || null,
        city,
        state,
        rating: place.review_rating ? parseFloat(place.review_rating) : null,
        reviewCount: place.review_count ? parseInt(place.review_count) : null,
        googleMapsUrl: place.link || null,
        status: "imported",
      }).returning().get();

      // Queue for scraping if has website
      if (place.website) {
        db.insert(jobQueue).values({
          type: "scrape",
          leadId: lead.id,
          campaignId: campaignId || null,
        }).run();
      }

      imported++;
    }

    logActivity("import", `Importados ${imported} negocios desde búsqueda "${job.keyword}" (${skippedBlacklist} en blacklist, ${skippedNoName} sin nombre)`, {
      campaignId: campaignId || undefined,
      metadata: { searchJobId: jobId, imported, skippedBlacklist, skippedNoName, total: toImport.length },
      messageKey: "activityLog.importedFromSearch",
      messageVars: { count: imported, keyword: job.keyword },
    });

    return NextResponse.json({
      success: true,
      imported,
      skippedBlacklist,
      skippedNoName,
      total: toImport.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al importar resultados" },
      { status: 500 }
    );
  }
}
