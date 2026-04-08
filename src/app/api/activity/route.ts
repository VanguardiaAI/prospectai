import { NextRequest, NextResponse } from "next/server";
import { getRecentActivity } from "@/services/analytics.service";
import { handleServiceError } from "@/services/api-handler";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get("type") || undefined;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const result = getRecentActivity({ type, limit, page });
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
