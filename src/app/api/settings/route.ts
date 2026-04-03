import { NextRequest, NextResponse } from "next/server";
import { db, getSetting, setSetting } from "@/db";
import { settings } from "@/db/schema";
import { logActivity } from "@/lib/activity";

export async function GET() {
  const all = db.select().from(settings).all();
  const result: Record<string, string> = {};
  for (const row of all) {
    result[row.key] = row.value;
  }
  return NextResponse.json(result);
}

export async function PUT(req: NextRequest) {
  const body = await req.json();

  const allowedKeys = [
    // Agency identity
    "agency_name", "agency_url", "agency_description", "agency_services",
    // Country & locale
    "target_country", "phone_country_code", "phone_digits", "locale", "currency",
    // Email
    "from_email", "from_name", "global_daily_limit", "default_tone",
    // RGPD / compliance
    "unsubscribe_url", "legal_footer", "reply_to_email",
    // Warmup
    "warmup_enabled", "warmup_day", "warmup_start_limit", "warmup_increment", "warmup_max_limit",
    "send_window_start", "send_window_end",
    // Scraping
    "scrape_concurrency", "scrape_delay_ms", "autopilot_global",
    "gmaps_scraper_url", "gmaps_scraper_api_key",
  ];

  const updated: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (allowedKeys.includes(key)) {
      const oldValue = getSetting(key);
      setSetting(key, String(value));
      if (oldValue !== String(value)) {
        updated.push(key);
      }
    }
  }

  if (updated.length > 0) {
    logActivity("setting_change", `Configuración actualizada: ${updated.join(", ")}`, {
      metadata: body,
    });
  }

  return NextResponse.json({ success: true, updated });
}
