import { NextRequest, NextResponse } from "next/server";
import { validateBody, createABTestSchema, updateABTestSchema } from "@/lib/validations";
import * as abTestingService from "@/services/ab-testing.service";
import { handleServiceError } from "@/services/api-handler";

export async function GET() {
  try {
    const data = abTestingService.listABTests();
    return NextResponse.json(data);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(createABTestSchema, body);
  if (!v.success) return v.response;

  try {
    const result = abTestingService.createABTest(v.data);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(updateABTestSchema, body);
  if (!v.success) return v.response;

  try {
    const { id, ...updates } = v.data;
    const result = abTestingService.updateABTest(id, updates);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id") || "0");
  if (!id) return NextResponse.json({ error: "Missing test id" }, { status: 400 });

  try {
    const result = abTestingService.deleteABTest(id);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
