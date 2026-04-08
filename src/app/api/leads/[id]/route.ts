import { NextRequest, NextResponse } from "next/server";
import { getLeadDetails } from "@/services/lead.service";
import { handleServiceError } from "@/services/api-handler";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const result = getLeadDetails(Number(id));
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
