import { NextRequest, NextResponse } from "next/server";
import { validateBody, createBlacklistSchema } from "@/lib/validations";
import * as blacklistService from "@/services/blacklist.service";
import { handleServiceError } from "@/services/api-handler";

export async function GET() {
  try {
    const data = blacklistService.listBlacklist();
    return NextResponse.json(data);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(createBlacklistSchema, body);
  if (!v.success) return v.response;

  try {
    const result = blacklistService.addToBlacklist(v.data);
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  try {
    const result = blacklistService.removeFromBlacklist(Number(id));
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
