import { NextRequest, NextResponse } from "next/server";
import { validateBody, sequencePostSchema } from "@/lib/validations";
import * as sequenceService from "@/services/sequence.service";
import { handleServiceError } from "@/services/api-handler";

// GET: List sequence steps for a campaign
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }

  try {
    const data = sequenceService.getSequenceSteps(Number(campaignId));
    return NextResponse.json(data);
  } catch (err) {
    return handleServiceError(err);
  }
}

// POST: Create/update sequence steps for a campaign OR enroll leads
export async function POST(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(sequencePostSchema, body);
  if (!v.success) return v.response;

  const { action } = v.data;

  try {
    if (action === "save_steps") {
      const { campaignId, steps } = v.data as {
        campaignId: number;
        steps: { channel: string; delayDays: number; tone: string; customInstructions?: string; enabled: boolean }[];
      };
      const result = sequenceService.saveSteps(campaignId, steps);
      return NextResponse.json(result);
    }

    if (action === "enroll") {
      const { campaignId, leadIds } = v.data as { campaignId: number; leadIds: number[] };
      const result = sequenceService.enrollLeads(campaignId, leadIds);
      return NextResponse.json(result);
    }

    if (action === "pause") {
      const { enrollmentId } = v.data as { enrollmentId: number; action: string };
      const result = sequenceService.pauseEnrollment(enrollmentId);
      return NextResponse.json(result);
    }

    if (action === "resume") {
      const { enrollmentId } = v.data as { enrollmentId: number; action: string };
      const result = sequenceService.resumeEnrollment(enrollmentId);
      return NextResponse.json(result);
    }

    if (action === "stop") {
      const { enrollmentId } = v.data as { enrollmentId: number; action: string };
      const result = sequenceService.stopEnrollment(enrollmentId);
      return NextResponse.json(result);
    }

    return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    return handleServiceError(err);
  }
}
