import { NextRequest, NextResponse } from "next/server";
import { validateBody, startSearchSchema } from "@/lib/validations";
import * as searchService from "@/services/search.service";
import { handleServiceError } from "@/services/api-handler";

// POST: Submit a new search to google-maps-scraper
export async function POST(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(startSearchSchema, body);
  if (!v.success) return v.response;

  try {
    const job = await searchService.startSearch(v.data);
    return NextResponse.json({ success: true, job });
  } catch (err) {
    return handleServiceError(err);
  }
}

// GET: List all search jobs
export async function GET() {
  try {
    const jobs = searchService.listSearchJobs();
    return NextResponse.json({ jobs });
  } catch (err) {
    return handleServiceError(err);
  }
}
