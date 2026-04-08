import { NextResponse } from "next/server";
import { getDashboardMetrics } from "@/services/analytics.service";
import { handleServiceError } from "@/services/api-handler";

export async function GET() {
  try {
    const metrics = getDashboardMetrics();
    return NextResponse.json(metrics);
  } catch (err) {
    return handleServiceError(err);
  }
}
