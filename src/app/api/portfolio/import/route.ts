import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/db";
import { getDefaultAgencyProfile } from "@/services/agency-profile.service";
import { scrapeAndExtractProjects } from "@/lib/ai/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Auth is enforced by src/proxy.ts.
// POST { url? } → scrape the user's own site and AI-extract portfolio projects.
// Returns the extracted projects for REVIEW (nothing is saved here); the user
// confirms which to keep and the client posts them to /api/portfolio/projects.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const urlRaw = typeof body?.url === "string" ? body.url.trim() : "";
  const url = urlRaw || getDefaultAgencyProfile()?.url || getSetting("agency_url") || "";
  if (!url) {
    return NextResponse.json({ error: "no_url" }, { status: 400 });
  }

  try {
    const { projects, pagesScraped } = await scrapeAndExtractProjects(url);
    return NextResponse.json({ projects, pagesScraped, url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
