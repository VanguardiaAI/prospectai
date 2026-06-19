import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/db";
import { getDefaultAgencyProfile } from "@/services/agency-profile.service";
import { scrapeAndExtractProjects } from "@/lib/ai/portfolio";
import { getPortfolioProjects } from "@/db/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Auth is enforced by src/proxy.ts.

const normTitle = (s: string | null | undefined) =>
  (s || "").toLowerCase().replace(/[^a-z0-9áéíóúñü]+/gi, " ").trim();
const normUrl = (s: string | null | undefined) =>
  (s || "").toLowerCase().replace(/^https?:\/\//, "").replace(/\/+$/, "").trim();

// POST { url? } → scrape the user's own site and AI-extract portfolio projects.
// Returns the extracted projects for REVIEW (nothing is saved here), each flagged
// `duplicate` when it matches an already-saved project (by title or URL) or repeats
// within this batch, so the UI can skip it. The user confirms which to keep and the
// client posts them to /api/portfolio/projects.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const urlRaw = typeof body?.url === "string" ? body.url.trim() : "";
  const url = urlRaw || getDefaultAgencyProfile()?.url || getSetting("agency_url") || "";
  if (!url) {
    return NextResponse.json({ error: "no_url" }, { status: 400 });
  }

  try {
    const { projects, pagesScraped } = await scrapeAndExtractProjects(url);

    const existing = getPortfolioProjects();
    const existingTitles = new Set(existing.map((p) => normTitle(p.title)).filter(Boolean));
    const existingUrls = new Set(existing.map((p) => normUrl(p.projectUrl)).filter(Boolean));

    const seenTitles = new Set<string>();
    const annotated = projects.map((p) => {
      const t = normTitle(p.title);
      const u = normUrl(p.projectUrl);
      const duplicate =
        (!!t && (existingTitles.has(t) || seenTitles.has(t))) || (!!u && existingUrls.has(u));
      if (t) seenTitles.add(t);
      return { ...p, duplicate };
    });

    return NextResponse.json({ projects: annotated, pagesScraped, url });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
