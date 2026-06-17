import { NextRequest, NextResponse } from "next/server";
import { validateBody, updateSettingsSchema } from "@/lib/validations";
import * as settingsService from "@/services/settings.service";
import { handleServiceError } from "@/services/api-handler";
import { getApiKey } from "@/db";

// Secret settings: never sent to the client as plaintext. Instead we expose a
// `<key>_configured` boolean so the UI can show "configured" without the value.
const SECRET_KEYS: Array<[string, string]> = [
  ["gemini_api_key", "GEMINI_API_KEY"],
  ["anthropic_api_key", "ANTHROPIC_API_KEY"],
  ["resend_api_key", "RESEND_API_KEY"],
  ["gmaps_scraper_api_key", ""],
  ["imap_password", "IMAP_PASSWORD"],
  ["smtp_password", "SMTP_PASSWORD"],
];

export async function GET() {
  try {
    const data = settingsService.getAllSettings();
    for (const [key, env] of SECRET_KEYS) {
      const configured = env ? !!getApiKey(key, env) : !!(data[key] && data[key].trim());
      data[`${key}_configured`] = configured ? "true" : "false";
      data[key] = "";
    }
    // Internal cursor — not a user-editable setting; never expose to the client.
    delete data.imap_last_uid;
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
