import { NextRequest, NextResponse } from "next/server";
import { getDashboardMetrics, getDashboardSamples } from "@/services/analytics.service";
import { handleServiceError } from "@/services/api-handler";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const raw = searchParams.get("campaignId");
    const campaignId = raw && raw !== "all" ? Number(raw) : null;
    const cid = campaignId != null && Number.isFinite(campaignId) ? campaignId : null;

    const metrics = getDashboardMetrics(cid);
    const samples = getDashboardSamples(cid);
    return NextResponse.json({ ...metrics, samples });
  } catch (err) {
    return handleServiceError(err);
  }
}
