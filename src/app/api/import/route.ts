import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leads, blacklist, jobQueue } from "@/db/schema";
import { eq, and, or, sql } from "drizzle-orm";
import Papa from "papaparse";
import { logActivity } from "@/lib/activity";

// Common Outscraper CSV column mappings
const COLUMN_MAP: Record<string, string> = {
  name: "name",
  nombre: "name",
  full_name: "name",
  title: "name",
  category: "category",
  categoría: "category",
  type: "category",
  phone: "phone",
  teléfono: "phone",
  phone_number: "phone",
  email: "email",
  correo: "email",
  email_1: "email",
  site: "website",
  website: "website",
  web: "website",
  sitio_web: "website",
  full_address: "address",
  address: "address",
  dirección: "address",
  street_address: "address",
  city: "city",
  ciudad: "city",
  state: "state",
  estado: "state",
  rating: "rating",
  calificación: "rating",
  reviews: "reviewCount",
  review_count: "reviewCount",
  reviews_count: "reviewCount",
  total_reviews: "reviewCount",
  google_maps_url: "googleMapsUrl",
  url: "googleMapsUrl",
  link: "googleMapsUrl",
  place_url: "googleMapsUrl",
};

function mapColumns(row: Record<string, string>): Record<string, string | number | null> {
  const mapped: Record<string, string | number | null> = {};
  for (const [csvCol, value] of Object.entries(row)) {
    const normalizedCol = csvCol.toLowerCase().trim().replace(/\s+/g, "_");
    const mappedKey = COLUMN_MAP[normalizedCol];
    if (mappedKey && value && value.trim()) {
      mapped[mappedKey] = value.trim();
    }
  }
  return mapped;
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const campaignId = formData.get("campaignId") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const csvText = await file.text();
    const { data, errors } = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    if (errors.length > 0 && data.length === 0) {
      return NextResponse.json({ error: "Invalid CSV file", details: errors }, { status: 400 });
    }

    // Get blacklisted domains and emails
    const blacklisted = db.select().from(blacklist).all();
    const blacklistSet = new Set(blacklisted.map((b) => b.value.toLowerCase()));

    // Build existing leads lookup for deduplication
    const existingLeads = db.select({
      name: sql<string>`lower(${leads.name})`,
      city: sql<string>`lower(coalesce(${leads.city}, ''))`,
      phone: leads.phone,
      website: sql<string>`lower(coalesce(${leads.website}, ''))`,
    }).from(leads).all();

    const dupeNameCity = new Set(existingLeads.map(l => `${l.name}||${l.city}`));
    const dupePhone = new Set(existingLeads.filter(l => l.phone).map(l => l.phone!));
    const dupeWebsite = new Set(existingLeads.filter(l => l.website).map(l => l.website));

    let imported = 0;
    let skipped = 0;
    let blacklistedCount = 0;
    let duplicates = 0;

    for (const row of data) {
      const mapped = mapColumns(row);

      if (!mapped.name) {
        skipped++;
        continue;
      }

      // Check blacklist
      const domain = mapped.website
        ? new URL(
            (mapped.website as string).startsWith("http") ? (mapped.website as string) : `https://${mapped.website}`
          ).hostname.replace("www.", "")
        : null;

      if (domain && blacklistSet.has(domain)) {
        blacklistedCount++;
        continue;
      }
      if (mapped.email && blacklistSet.has((mapped.email as string).toLowerCase())) {
        blacklistedCount++;
        continue;
      }

      // Check duplicates
      const nameLower = (mapped.name as string).toLowerCase();
      const cityLower = ((mapped.city as string) || "").toLowerCase();
      const phoneTrim = (mapped.phone as string) || "";
      const websiteLower = ((mapped.website as string) || "").toLowerCase();

      const isDupeNameCity = dupeNameCity.has(`${nameLower}||${cityLower}`);
      const isDupePhone = phoneTrim && dupePhone.has(phoneTrim);
      const isDupeWebsite = websiteLower && dupeWebsite.has(websiteLower);

      if (isDupeNameCity || isDupePhone || isDupeWebsite) {
        duplicates++;
        continue;
      }

      // Mark as seen for subsequent rows in same import
      dupeNameCity.add(`${nameLower}||${cityLower}`);
      if (phoneTrim) dupePhone.add(phoneTrim);
      if (websiteLower) dupeWebsite.add(websiteLower);

      // Insert lead
      const lead = db.insert(leads).values({
        campaignId: campaignId ? Number(campaignId) : null,
        name: mapped.name as string,
        category: (mapped.category as string) || null,
        phone: (mapped.phone as string) || null,
        email: (mapped.email as string) || null,
        website: (mapped.website as string) || null,
        address: (mapped.address as string) || null,
        city: (mapped.city as string) || null,
        state: (mapped.state as string) || null,
        rating: mapped.rating ? parseFloat(mapped.rating as string) : null,
        reviewCount: mapped.reviewCount ? parseInt(mapped.reviewCount as string) : null,
        googleMapsUrl: (mapped.googleMapsUrl as string) || null,
        status: mapped.website ? "imported" : "imported",
      }).returning().get();

      // Queue for scraping if has website
      if (mapped.website) {
        db.insert(jobQueue).values({
          type: "scrape",
          leadId: lead.id,
          campaignId: campaignId ? Number(campaignId) : null,
        }).run();
      }

      imported++;
    }

    logActivity("import", `Importados ${imported} negocios (${skipped} omitidos, ${blacklistedCount} en blacklist, ${duplicates} duplicados)`, {
      campaignId: campaignId ? Number(campaignId) : undefined,
      metadata: { imported, skipped, blacklisted: blacklistedCount, duplicates, total: data.length },
    });

    return NextResponse.json({
      success: true,
      imported,
      skipped,
      blacklisted: blacklistedCount,
      duplicates,
      total: data.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
