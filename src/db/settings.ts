import { sqlite } from "./connection";

// Insert default settings if not exist
const defaultSettings: Record<string, string> = {
  // Agency identity
  agency_name: "VanguardIA",
  agency_url: "vanguardia.dev",
  agency_description: "Agencia de desarrollo web y soluciones digitales",
  // Services offered (comma-separated)
  agency_services: "web_development,seo,ai_agents,google_business,social_media",
  // Country & locale
  target_country: "ES",
  phone_country_code: "34",
  phone_digits: "9",
  locale: "es-ES",
  currency: "EUR",
  // Email settings
  from_email: "hola@vanguardia.dev",
  from_name: "VanguardIA",
  global_daily_limit: "50",
  default_tone: "profesional",
  // RGPD / compliance
  unsubscribe_url: "",
  legal_footer: "Este email se envía en base a interés legítimo profesional (Art. 6.1.f RGPD).",
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
  // Reply-To
  reply_to_email: "",
  // Tracking
  tracking_base_url: "",
  // CRM
  crm_webhook_url: "",
  crm_webhook_on: "replied",
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
