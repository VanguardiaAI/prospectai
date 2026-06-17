import { z } from "zod";

const ALLOWED_SETTINGS_KEYS = [
  "agency_name", "agency_url", "agency_description", "agency_services",
  "target_country", "phone_country_code", "phone_digits",
  "locale", "currency",
  "from_email", "from_name",
  "global_daily_limit", "default_tone",
  "unsubscribe_url", "legal_footer", "reply_to_email",
  "warmup_enabled", "warmup_day", "warmup_start_limit", "warmup_increment", "warmup_max_limit",
  "send_window_start", "send_window_end",
  "scrape_concurrency", "scrape_delay_ms",
  "autopilot_global",
  "gmaps_scraper_url", "gmaps_scraper_api_key",
  "gemini_api_key", "anthropic_api_key", "resend_api_key",
  "wa_daily_limit",
  "ai_provider", "chatbot_provider",
  "email_provider", "smtp_host", "smtp_port", "smtp_user", "smtp_password",
  "imap_enabled", "imap_host", "imap_port", "imap_user", "imap_password", "imap_last_uid",
  "tracking_base_url",
  "crm_webhook_url", "crm_webhook_on",
] as const;

export const updateSettingsSchema = z.record(z.string(), z.string()).refine(
  (data) => {
    const keys = Object.keys(data);
    return keys.length > 0 && keys.every((k) => (ALLOWED_SETTINGS_KEYS as readonly string[]).includes(k));
  },
  { message: "Invalid or empty settings keys" }
);
