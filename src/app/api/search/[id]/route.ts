import { NextRequest, NextResponse } from "next/server";
import { db, getSetting } from "@/db";
import { searchJobs } from "@/db/schema";
import { eq } from "drizzle-orm";
import Papa from "papaparse";

// Map scraper status ("pending","working","ok","failed") to our status
function mapStatus(scraperStatus: string): string {
  switch (scraperStatus) {
    case "ok": return "completed";
    case "failed": return "failed";
    case "working": return "running";
    default: return "pending";
  }
}

// Parse CSV results into structured place objects
function parseCsvResults(csvText: string): Record<string, string>[] {
  const { data } = Papa.parse<Record<string, string>>(csvText, {
    header: true,
    skipEmptyLines: true,
  });
  return data;
}

// GET: Get search job status, polling the scraper if still running
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const jobId = Number(id);

    const job = db.select().from(searchJobs).where(eq(searchJobs.id, jobId)).get();
    if (!job) {
      return NextResponse.json({ error: "Búsqueda no encontrada" }, { status: 404 });
    }

    // If job is still pending/running, poll the scraper for updates
    if ((job.status === "pending" || job.status === "running") && job.scraperJobId) {
      const scraperUrl = getSetting("gmaps_scraper_url") || "http://localhost:8081";

      try {
        // Check job status via JSON API
        const statusRes = await fetch(`${scraperUrl}/api/v1/jobs/${job.scraperJobId}`);

        if (statusRes.ok) {
          const scraperJob = await statusRes.json();
          const newStatus = mapStatus(scraperJob.Status);

          const updateData: Record<string, unknown> = { status: newStatus };

          if (newStatus === "completed") {
            // Download CSV results
            const csvRes = await fetch(`${scraperUrl}/api/v1/jobs/${job.scraperJobId}/download`);
            if (csvRes.ok) {
              const csvText = await csvRes.text();
              const results = parseCsvResults(csvText);
              updateData.results = JSON.stringify(results);
              updateData.resultCount = results.length;
            }
            updateData.completedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
          }

          if (newStatus === "failed") {
            updateData.error = "El scraper reportó un error al procesar la búsqueda";
            updateData.completedAt = new Date().toISOString().replace("T", " ").slice(0, 19);
          }

          if (newStatus !== job.status || updateData.results) {
            db.update(searchJobs).set(updateData).where(eq(searchJobs.id, jobId)).run();
          }

          // Return updated job
          const updatedJob = db.select().from(searchJobs).where(eq(searchJobs.id, jobId)).get();
          return NextResponse.json({
            job: {
              ...updatedJob,
              results: updatedJob?.results ? JSON.parse(updatedJob.results) : null,
            },
          });
        }
      } catch {
        // If we can't reach the scraper, return current state
      }
    }

    return NextResponse.json({
      job: {
        ...job,
        results: job.results ? JSON.parse(job.results) : null,
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al obtener búsqueda" },
      { status: 500 }
    );
  }
}
