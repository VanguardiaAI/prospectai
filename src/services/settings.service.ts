import { db, getSetting, setSetting } from "@/db";
import { settings } from "@/db/schema";
import { logActivity } from "@/lib/activity";
import { checkFullConfig } from "@/mcp/helpers/validators";
import { getChannelsInUse } from "@/services/campaign.service";
import { isWhatsAppReady } from "@/lib/whatsapp-client";

// ─── Service Functions ──────────────────────────────────────────────

export function getAllSettings() {
  const all = db.select().from(settings).all();
  const result: Record<string, string> = {};
  for (const row of all) {
    result[row.key] = row.value;
  }
  return result;
}

// Secret keys are never cleared by an empty submit (the UI sends an empty field
// when the user leaves a "configured" key untouched).
const SECRET_KEYS = new Set(["gemini_api_key", "anthropic_api_key", "resend_api_key", "gmaps_scraper_api_key", "imap_password", "smtp_password"]);

export function updateSettings(updates: Record<string, string>) {
  const changed: string[] = [];

  for (const [key, value] of Object.entries(updates)) {
    if (SECRET_KEYS.has(key) && !String(value).trim()) continue;
    const oldValue = getSetting(key);
    setSetting(key, String(value));
    if (oldValue !== String(value)) {
      changed.push(key);
    }
  }

  if (changed.length > 0) {
    logActivity("setting_change", `Configuración actualizada: ${changed.join(", ")}`, {
      metadata: updates,
      messageKey: "activityLog.configUpdated",
      messageVars: { fields: changed.join(", ") },
    });
  }

  return { success: true, updated: changed };
}

export function checkConfiguration() {
  const checks = checkFullConfig();
  const inUse = getChannelsInUse();

  // A service is only "required" when at least one live campaign uses that
  // channel — that's what gates the missing-config warning. WhatsApp readiness
  // lives in the web-app process, so resolve `ok` from the live client state.
  return {
    ...checks,
    email: { ...checks.email, required: inUse.email },
    whatsapp: {
      ...checks.whatsapp,
      required: inUse.whatsapp,
      ok: isWhatsAppReady(),
    },
  };
}
