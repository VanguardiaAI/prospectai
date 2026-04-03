import { NextRequest, NextResponse } from "next/server";
import { db, getSetting } from "@/db";
import { searchJobs } from "@/db/schema";
import { desc } from "drizzle-orm";
import { logActivity } from "@/lib/activity";

// POST: Submit a new search to google-maps-scraper
export async function POST(req: NextRequest) {
  try {
    const { keyword, campaignId, maxDepth = 5 } = await req.json();

    if (!keyword || typeof keyword !== "string" || !keyword.trim()) {
      return NextResponse.json({ error: "Se requiere un término de búsqueda" }, { status: 400 });
    }

    const scraperUrl = getSetting("gmaps_scraper_url") || "http://localhost:8081";

    // Submit job via the web form endpoint (works in free version)
    const formData = new URLSearchParams();
    formData.set("name", `prospectai-${Date.now()}`);
    formData.set("keywords", keyword.trim());
    formData.set("lang", "es");
    formData.set("depth", String(Math.min(Math.max(maxDepth, 1), 100)));
    formData.set("email", "on");
    formData.set("maxtime", "10m");
    formData.set("zoom", "15");
    formData.set("latitude", "0");
    formData.set("longitude", "0");
    formData.set("radius", "10000");

    const scraperRes = await fetch(`${scraperUrl}/scrape`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: formData.toString(),
    });

    if (!scraperRes.ok) {
      const errBody = await scraperRes.text();
      return NextResponse.json(
        { error: `Error del scraper: ${scraperRes.status} - ${errBody}` },
        { status: 502 }
      );
    }

    // Parse job UUID from HTMX HTML response
    const responseHtml = await scraperRes.text();
    const match = responseHtml.match(/<td>([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})<\/td>/);
    const scraperJobId = match?.[1];

    if (!scraperJobId) {
      return NextResponse.json(
        { error: `No se pudo obtener el ID del job del scraper` },
        { status: 502 }
      );
    }

    // Save search job to database
    const job = db.insert(searchJobs).values({
      scraperJobId,
      keyword: keyword.trim(),
      campaignId: campaignId ? Number(campaignId) : null,
      status: "pending",
    }).returning().get();

    logActivity("import", `Búsqueda iniciada: "${keyword.trim()}"`, {
      campaignId: campaignId ? Number(campaignId) : undefined,
      metadata: { searchJobId: job.id, scraperJobId },
    });

    return NextResponse.json({ success: true, job });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al iniciar búsqueda";
    if (message.includes("fetch failed") || message.includes("ECONNREFUSED")) {
      return NextResponse.json(
        { error: "No se pudo conectar con el scraper. Verifica que Docker esté corriendo." },
        { status: 502 }
      );
    }
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// GET: List all search jobs
export async function GET() {
  try {
    const jobs = db
      .select({
        id: searchJobs.id,
        scraperJobId: searchJobs.scraperJobId,
        keyword: searchJobs.keyword,
        campaignId: searchJobs.campaignId,
        status: searchJobs.status,
        resultCount: searchJobs.resultCount,
        error: searchJobs.error,
        createdAt: searchJobs.createdAt,
        completedAt: searchJobs.completedAt,
      })
      .from(searchJobs)
      .orderBy(desc(searchJobs.createdAt))
      .limit(50)
      .all();

    return NextResponse.json({ jobs });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al listar búsquedas" },
      { status: 500 }
    );
  }
}
