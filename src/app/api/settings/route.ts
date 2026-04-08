import { NextRequest, NextResponse } from "next/server";
import { validateBody, updateSettingsSchema } from "@/lib/validations";
import * as settingsService from "@/services/settings.service";
import { handleServiceError } from "@/services/api-handler";

export async function GET() {
  try {
    const data = settingsService.getAllSettings();
    return NextResponse.json(data);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(updateSettingsSchema, body);
  if (!v.success) return v.response;

  try {
    const result = settingsService.updateSettings(v.data);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
