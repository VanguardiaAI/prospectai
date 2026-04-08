import { NextRequest, NextResponse } from "next/server";
import { validateBody, createCampaignSchema, updateCampaignSchema } from "@/lib/validations";
import * as campaignService from "@/services/campaign.service";
import { handleServiceError } from "@/services/api-handler";

export async function GET() {
  try {
    const data = campaignService.listCampaigns();
    return NextResponse.json(data);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(createCampaignSchema, body);
  if (!v.success) return v.response;

  try {
    const { campaign } = campaignService.createCampaign(v.data);
    return NextResponse.json(campaign, { status: 201 });
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(updateCampaignSchema, body);
  if (!v.success) return v.response;

  try {
    const { id, ...updates } = v.data;
    const result = campaignService.updateCampaign(id, updates);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  try {
    const result = campaignService.deleteCampaign(Number(id));
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
