import { NextResponse } from "next/server";
import { getCampaignsWithPhases } from "@/services/campaign.service";
import { handleServiceError } from "@/services/api-handler";

export async function GET() {
  try {
    const data = getCampaignsWithPhases();
    return NextResponse.json(data);
  } catch (err) {
    return handleServiceError(err);
  }
}
