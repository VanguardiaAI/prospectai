import { NextResponse } from "next/server";
import { getTodayMetrics } from "@/services/analytics.service";
import { handleServiceError } from "@/services/api-handler";

export async function GET() {
  try {
    const metrics = getTodayMetrics();
    return NextResponse.json(metrics);
  } catch (err) {
    return handleServiceError(err);
  }
}
