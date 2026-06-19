import { z } from "zod";

const ALLOWED_SETTINGS_KEYS = [
  "agency_name", "agency_url", "agency_description", "agency_services",
  "target_country", "phone_country_code", "phone_digits",
  "locale", "currency",
  "from_email", "from_name",
  "global_daily_limit", "default_tone",
  "unsubscribe_url", "legal_footer", "reply_to_email",
  "warmup_enabled", "warmup_day", "warmup_start_limit", "warmup_increment", "warmup_max_limit",
  "send_window_start", "send_window_end", "send_next_day", "send_skip_weekends",
  "fallback_delay_days",
  "scrape_concurrency", "scrape_delay_ms",
  "autopilot_global",
  "gmaps_scraper_url", "gmaps_scraper_api_key",
  "gemini_api_key", "anthropic_api_key", "resend_api_key",
  "wa_daily_limit",
  "wa_warmup_enabled", "wa_warmup_day", "wa_warmup_start_limit", "wa_warmup_increment", "wa_warmup_max_limit",
  "ai_provider", "chatbot_provider",
  // Chatbot UX: proactive in-thread nudges (claude_cli only) + unrestricted dev mode.
  "proactive_chat_enabled", "chatbot_dev_mode",
  "email_provider", "smtp_host", "smtp_port", "smtp_user", "smtp_password",
  "imap_enabled", "imap_host", "imap_port", "imap_user", "imap_password", "imap_last_uid",
  "tracking_base_url",
  "crm_webhook_url", "crm_webhook_on",
  // Workana add-on (optional)
  "workana_enabled", "workana_weekly_connections", "workana_profile_url",
  "workana_auth_state", "workana_last_scan_at",
  "workana_headless", "workana_locale", "workana_timezone",
  "workana_scan_interval_hours", "workana_max_eval_per_scan", "workana_max_drafts_per_scan",
  "workana_allow_submit", "workana_replies_interval_hours", "workana_last_replies_at",
  "workana_style_examples", "workana_feed_pages",
  // Auto-spaced sender (Professional plan: 17/week, ≥20 min apart, best-first + reserve)
  "workana_autosend_enabled", "workana_min_send_interval_minutes", "workana_max_sends_per_day",
  // Opt-in: auto-start the cron scheduler (engine) on server boot.
  "scheduler_autostart",
  // Portfolio knowledge base + reply assistant
  "portfolio_enabled", "reply_autosuggest_enabled",
] as const;

export const updateSettingsSchema = z.record(z.string(), z.string()).refine(
  (data) => {
    const keys = Object.keys(data);
    return keys.length > 0 && keys.every((k) => (ALLOWED_SETTINGS_KEYS as readonly string[]).includes(k));
  },
  { message: "Invalid or empty settings keys" }
);
