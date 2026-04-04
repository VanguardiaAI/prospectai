import { sqlite } from "./connection";

export function runMigrations(): void {
  // Initialize tables
  sqlite.exec(`
  CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    daily_limit INTEGER NOT NULL DEFAULT 20,
    quality_threshold INTEGER NOT NULL DEFAULT 40,
    autopilot INTEGER NOT NULL DEFAULT 0,
    default_tone TEXT NOT NULL DEFAULT 'profesional',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS leads (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER REFERENCES campaigns(id),
    name TEXT NOT NULL,
    category TEXT,
    phone TEXT,
    email TEXT,
    website TEXT,
    address TEXT,
    city TEXT,
    state TEXT,
    rating REAL,
    review_count INTEGER,
    google_maps_url TEXT,
    extracted_email TEXT,
    contact_email TEXT,
    web_quality_score INTEGER,
    opportunity_score INTEGER,
    analysis_json TEXT,
    analysis_summary TEXT,
    status TEXT NOT NULL DEFAULT 'imported',
    error_message TEXT,
    notes TEXT,
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    scraped_at TEXT,
    analyzed_at TEXT,
    email_sent_at TEXT
  );

  CREATE TABLE IF NOT EXISTS emails (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    campaign_id INTEGER REFERENCES campaigns(id),
    to_email TEXT NOT NULL,
    from_email TEXT,
    subject TEXT NOT NULL,
    body_html TEXT NOT NULL,
    body_text TEXT NOT NULL,
    tone TEXT NOT NULL DEFAULT 'profesional',
    status TEXT NOT NULL DEFAULT 'draft',
    resend_id TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS blacklist (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    value TEXT NOT NULL UNIQUE,
    reason TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS activity_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    message TEXT NOT NULL,
    lead_id INTEGER,
    campaign_id INTEGER,
    metadata TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS job_queue (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    lead_id INTEGER REFERENCES leads(id),
    campaign_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    attempts INTEGER NOT NULL DEFAULT 0,
    max_attempts INTEGER NOT NULL DEFAULT 3,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    processed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
  CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
  CREATE INDEX IF NOT EXISTS idx_leads_city ON leads(city);
  CREATE INDEX IF NOT EXISTS idx_emails_lead ON emails(lead_id);
  CREATE INDEX IF NOT EXISTS idx_emails_status ON emails(status);
  CREATE INDEX IF NOT EXISTS idx_job_queue_status ON job_queue(status, type);
  CREATE INDEX IF NOT EXISTS idx_activity_log_type ON activity_log(type);

  CREATE TABLE IF NOT EXISTS search_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    scraper_job_id TEXT,
    keyword TEXT NOT NULL,
    campaign_id INTEGER REFERENCES campaigns(id),
    status TEXT NOT NULL DEFAULT 'pending',
    result_count INTEGER DEFAULT 0,
    results TEXT,
    error TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_search_jobs_status ON search_jobs(status);

  CREATE TABLE IF NOT EXISTS whatsapp_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    campaign_id INTEGER REFERENCES campaigns(id),
    to_phone TEXT NOT NULL,
    body TEXT NOT NULL,
    tone TEXT NOT NULL DEFAULT 'profesional',
    status TEXT NOT NULL DEFAULT 'draft',
    wa_message_id TEXT,
    sent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_wa_messages_lead ON whatsapp_messages(lead_id);
  CREATE INDEX IF NOT EXISTS idx_wa_messages_status ON whatsapp_messages(status);

  CREATE TABLE IF NOT EXISTS sequence_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
    step_number INTEGER NOT NULL DEFAULT 1,
    channel TEXT NOT NULL DEFAULT 'email',
    delay_days INTEGER NOT NULL DEFAULT 3,
    tone TEXT NOT NULL DEFAULT 'profesional',
    custom_instructions TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS sequence_enrollments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id),
    current_step INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    next_action_at TEXT,
    enrolled_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_enrollments_status ON sequence_enrollments(status);
  CREATE INDEX IF NOT EXISTS idx_enrollments_next_action ON sequence_enrollments(next_action_at);

  CREATE TABLE IF NOT EXISTS unsubscribes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    lead_id INTEGER REFERENCES leads(id),
    unsubscribed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_unsubscribes_email ON unsubscribes(email);
  CREATE INDEX IF NOT EXISTS idx_unsubscribes_token ON unsubscribes(token);

  CREATE TABLE IF NOT EXISTS ab_variants (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER REFERENCES campaigns(id),
    name TEXT NOT NULL,
    variant_a TEXT NOT NULL,
    variant_b TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ab_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    variant_id INTEGER NOT NULL REFERENCES ab_variants(id),
    email_id INTEGER REFERENCES emails(id),
    variant_group TEXT NOT NULL,
    opened INTEGER NOT NULL DEFAULT 0,
    clicked INTEGER NOT NULL DEFAULT 0,
    replied INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_ab_results_variant ON ab_results(variant_id);

  CREATE TABLE IF NOT EXISTS sending_domains (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    domain TEXT NOT NULL,
    from_email TEXT NOT NULL,
    from_name TEXT NOT NULL,
    daily_limit INTEGER NOT NULL DEFAULT 30,
    warmup_day INTEGER NOT NULL DEFAULT 1,
    warmup_start_limit INTEGER NOT NULL DEFAULT 5,
    warmup_increment INTEGER NOT NULL DEFAULT 5,
    status TEXT NOT NULL DEFAULT 'active',
    resend_api_key TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS email_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    channel TEXT NOT NULL DEFAULT 'email',
    category TEXT,
    subject_template TEXT NOT NULL,
    body_html_template TEXT NOT NULL,
    body_text_template TEXT NOT NULL,
    variables TEXT,
    usage_count INTEGER NOT NULL DEFAULT 0,
    avg_open_rate REAL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    lead_id INTEGER NOT NULL REFERENCES leads(id),
    campaign_id INTEGER REFERENCES campaigns(id),
    channel TEXT NOT NULL,
    from_address TEXT NOT NULL,
    body TEXT,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_replies_lead ON replies(lead_id);

  CREATE TABLE IF NOT EXISTS rate_limits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    locked_until TEXT,
    window_start TEXT NOT NULL
  );

  CREATE INDEX IF NOT EXISTS idx_rate_limits_key ON rate_limits(key);
`);

  // Column migrations for existing DBs
  const safeAddColumn = (sql: string) => {
    try { sqlite.exec(sql); } catch { /* Column already exists */ }
  };

  safeAddColumn(`ALTER TABLE leads ADD COLUMN wa_sent_at TEXT`);
  safeAddColumn(`ALTER TABLE emails ADD COLUMN opened_at TEXT`);
  safeAddColumn(`ALTER TABLE emails ADD COLUMN clicked_at TEXT`);
  safeAddColumn(`ALTER TABLE email_templates ADD COLUMN channel TEXT NOT NULL DEFAULT 'email'`);
  safeAddColumn(`ALTER TABLE ab_variants ADD COLUMN channel TEXT NOT NULL DEFAULT 'email'`);
  safeAddColumn(`ALTER TABLE ab_results ADD COLUMN whatsapp_message_id INTEGER`);
  safeAddColumn(`ALTER TABLE sending_domains ADD COLUMN warmup_start_limit INTEGER NOT NULL DEFAULT 5`);
  safeAddColumn(`ALTER TABLE sending_domains ADD COLUMN warmup_increment INTEGER NOT NULL DEFAULT 5`);
}
