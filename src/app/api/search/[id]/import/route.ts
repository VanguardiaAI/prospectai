import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { searchJobs, leads, blacklist, jobQueue } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { validateBody, importSearchResultsSchema } from "@/lib/validations";
import { classifyLead, extractDomain, parseEmailsField } from "@/lib/lead-quality";

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

    // Existing leads — avoid re-importing the same business on a repeated search
    // (dedup by name+city / phone / website, same logic as the CSV importer).
    const existingLeads = db.select({
      name: sql<string>`lower(${leads.name})`,
      city: sql<string>`lower(coalesce(${leads.city}, ''))`,
      phone: leads.phone,
      website: sql<string>`lower(coalesce(${leads.website}, ''))`,
    }).from(leads).all();
    const dupeNameCity = new Set(existingLeads.map((l) => `${l.name}||${l.city}`));
    const dupePhone = new Set(existingLeads.filter((l) => l.phone).map((l) => l.phone!));
    const dupeWebsite = new Set(existingLeads.filter((l) => l.website).map((l) => l.website));

    let imported = 0;
    let skippedBlacklist = 0;
    let skippedNoName = 0;
    let skippedGovernment = 0;
    let skippedDuplicate = 0;

    for (const place of toImport) {
      if (!place.title) {
        skippedNoName++;
        continue;
      }

      const domain = extractDomain(place.website);
      const emails = parseEmailsField(place.emails);
      const email = emails[0] || null;

      // Hard-skip government sites/orgs regardless of what the user selected: no
      // sale is possible and the address is a generic switchboard. Hospitals and
      // other "low" leads are NOT skipped here — if the user explicitly selected
      // them they get imported (the UI just doesn't pre-select them).
      const quality = classifyLead({
        name: place.title,
        category: place.category,
        website: place.website,
        domain,
        emails: place.emails,
        phone: place.phone,
      });
      if (quality.tier === "excluded") {
        skippedGovernment++;
        continue;
      }

      // Check blacklist (domain or email)
      if (domain && blacklistSet.has(domain)) {
        skippedBlacklist++;
        continue;
      }
      if (email && blacklistSet.has(email.toLowerCase())) {
        skippedBlacklist++;
        continue;
      }

      // Extract city and state from complete_address (real Google Maps data)
      const { city, state } = extractCityState(place.complete_address, place.address);

      // Skip businesses already in the lead list so a repeated search doesn't
      // create duplicates (also dedups within this same batch).
      const nameKey = `${place.title.toLowerCase()}||${(city || "").toLowerCase()}`;
      const websiteLower = (place.website || "").toLowerCase();
      if (
        dupeNameCity.has(nameKey) ||
        (place.phone && dupePhone.has(place.phone)) ||
        (websiteLower && dupeWebsite.has(websiteLower))
      ) {
        skippedDuplicate++;
        continue;
      }
      dupeNameCity.add(nameKey);
      if (place.phone) dupePhone.add(place.phone);
      if (websiteLower) dupeWebsite.add(websiteLower);

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
        source: "search",
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

    logActivity("import", `Importados ${imported} negocios desde búsqueda "${job.keyword}" (${skippedGovernment} de gobierno, ${skippedDuplicate} duplicados, ${skippedBlacklist} en blacklist, ${skippedNoName} sin nombre)`, {
      campaignId: campaignId || undefined,
      metadata: { searchJobId: jobId, imported, skippedGovernment, skippedDuplicate, skippedBlacklist, skippedNoName, total: toImport.length },
      messageKey: "activityLog.importedFromSearch",
      messageVars: { count: imported, keyword: job.keyword },
    });

    return NextResponse.json({
      success: true,
      imported,
      skippedGovernment,
      skippedDuplicate,
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
