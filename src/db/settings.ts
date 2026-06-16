import { sqlite } from "./connection";

// Insert default settings if not exist
const defaultSettings: Record<string, string> = {
  // Agency identity — configure these in Settings after first login
  agency_name: "",
  agency_url: "",
  agency_description: "",
  // Services offered (comma-separated)
  agency_services: "",
  // Country & locale
  target_country: "",
  phone_country_code: "",
  phone_digits: "",
  locale: "en-US",
  currency: "USD",
  // Email settings
  from_email: "",
  from_name: "",
  global_daily_limit: "50",
  default_tone: "professional",
  // Compliance
  unsubscribe_url: "",
  legal_footer: "",
  // Warmup
  warmup_enabled: "true",
  warmup_day: "1",
  warmup_start_limit: "5",
  warmup_increment: "5",
  warmup_max_limit: "50",
  send_window_start: "9",
  send_window_end: "18",
  // Scraping
  scrape_concurrency: "3",
  scrape_delay_ms: "2000",
  autopilot_global: "false",
  gmaps_scraper_url: "http://localhost:8081",
  gmaps_scraper_api_key: "",
  // Provider API keys — a non-empty DB value overrides the .env var
  gemini_api_key: "",
  resend_api_key: "",
  // Reply-To
  reply_to_email: "",
  // Tracking
  tracking_base_url: "",
  // CRM
  crm_webhook_url: "",
  crm_webhook_on: "replied",
  // Chatbot
  chatbot_provider: "gemini",
  // WhatsApp
  wa_daily_limit: "20",
};

export function initializeDefaultSettings(): void {
  for (const [key, value] of Object.entries(defaultSettings)) {
    sqlite.exec(`INSERT OR IGNORE INTO settings (key, value) VALUES ('${key}', '${value}')`);
  }
}

export function getSetting(key: string): string | null {
  const row = sqlite.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  sqlite.prepare("INSERT OR REPLACE INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now'))").run(key, value);
}

/**
 * Resolve a provider API key: prefer the value stored in the settings table,
 * otherwise fall back to the environment variable. Lets keys be managed from
 * the app UI without a restart while keeping `.env` working when unset.
 */
export function getApiKey(settingKey: string, envName: string): string {
  const fromDb = getSetting(settingKey);
  if (fromDb && fromDb.trim()) return fromDb.trim();
  return process.env[envName] || "";
}
