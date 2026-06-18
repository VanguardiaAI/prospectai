import { NextResponse } from "next/server";
import { getSendingQuota } from "@/services/analytics.service";
import { handleServiceError } from "@/services/api-handler";

export async function GET() {
  try {
    return NextResponse.json(getSendingQuota());
  } catch (err) {
    return handleServiceError(err);
  }
}
