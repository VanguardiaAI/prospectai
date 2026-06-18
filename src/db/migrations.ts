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
    default_tone TEXT NOT NULL DEFAULT 'professional',
    strategy TEXT NOT NULL DEFAULT 'web_design',
    channels TEXT NOT NULL DEFAULT 'email',
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
    tone TEXT NOT NULL DEFAULT 'professional',
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

  CREATE TABLE IF NOT EXISTS agency_profile (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    url TEXT,
    description TEXT,
    tagline TEXT,
    owner_name TEXT,
    owner_role TEXT,
    contact_email TEXT,
    contact_phone TEXT,
    services TEXT,
    custom_services TEXT,
    city TEXT,
    country TEXT,
    value_props TEXT,
    case_studies TEXT,
    source TEXT,
    source_url TEXT,
    extracted_at TEXT,
    completed_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
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
    tone TEXT NOT NULL DEFAULT 'professional',
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
    tone TEXT NOT NULL DEFAULT 'professional',
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
    status TEXT NOT NULL DEFAULT 'unread',
    intent TEXT,
    handled_at TEXT,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_replies_lead ON replies(lead_id);

  -- Workana add-on (optional): saved searches, scraped projects, AI-drafted
  -- proposals (draft -> approved -> submitted), and client message inbox.
  CREATE TABLE IF NOT EXISTS workana_searches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    label TEXT,
    agency_profile_id INTEGER REFERENCES agency_profile(id),
    strategy TEXT NOT NULL DEFAULT 'web_design',
    filters TEXT,
    language TEXT NOT NULL DEFAULT 'auto',
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workana_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    workana_project_id TEXT NOT NULL UNIQUE,
    search_id INTEGER REFERENCES workana_searches(id),
    url TEXT,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT,
    skills TEXT,
    budget_type TEXT,
    budget_min REAL,
    budget_max REAL,
    currency TEXT,
    client_country TEXT,
    client_info TEXT,
    bids_count INTEGER,
    language TEXT,
    raw_text TEXT,
    fit_score INTEGER,
    should_bid INTEGER,
    reason TEXT,
    status TEXT NOT NULL DEFAULT 'new',
    published_at TEXT,
    scanned_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workana_proposals (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL REFERENCES workana_projects(id),
    agency_profile_id INTEGER REFERENCES agency_profile(id),
    cover_letter TEXT NOT NULL,
    bid_amount REAL,
    currency TEXT,
    delivery_days INTEGER,
    screening_answers TEXT,
    confidence INTEGER,
    status TEXT NOT NULL DEFAULT 'draft',
    submitted_at TEXT,
    workana_proposal_ref TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS workana_replies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER REFERENCES workana_projects(id),
    proposal_id INTEGER REFERENCES workana_proposals(id),
    external_id TEXT,
    from_name TEXT,
    body TEXT,
    suggested_reply TEXT,
    status TEXT NOT NULL DEFAULT 'unread',
    intent TEXT,
    handled_at TEXT,
    received_at TEXT NOT NULL DEFAULT (datetime('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_workana_projects_status ON workana_projects(status);
  CREATE INDEX IF NOT EXISTS idx_workana_proposals_project ON workana_proposals(project_id);
  CREATE INDEX IF NOT EXISTS idx_workana_proposals_status ON workana_proposals(status);
  CREATE INDEX IF NOT EXISTS idx_workana_replies_project ON workana_replies(project_id);
  CREATE INDEX IF NOT EXISTS idx_workana_replies_status ON workana_replies(status);
  CREATE INDEX IF NOT EXISTS idx_workana_replies_external ON workana_replies(external_id);

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
  // Conscious-override flag for the already-contacted guard (see contact-history).
  safeAddColumn(`ALTER TABLE emails ADD COLUMN dup_ack INTEGER NOT NULL DEFAULT 0`);
  safeAddColumn(`ALTER TABLE whatsapp_messages ADD COLUMN dup_ack INTEGER NOT NULL DEFAULT 0`);
  // Scheduled send instant: approvals are deferred to the configured window
  // instead of going out on the next cron tick (see lib/cron/send-schedule).
  safeAddColumn(`ALTER TABLE emails ADD COLUMN scheduled_for TEXT`);
  safeAddColumn(`ALTER TABLE whatsapp_messages ADD COLUMN scheduled_for TEXT`);
  safeAddColumn(`ALTER TABLE email_templates ADD COLUMN channel TEXT NOT NULL DEFAULT 'email'`);
  safeAddColumn(`ALTER TABLE ab_variants ADD COLUMN channel TEXT NOT NULL DEFAULT 'email'`);
  safeAddColumn(`ALTER TABLE ab_results ADD COLUMN whatsapp_message_id INTEGER`);
  safeAddColumn(`ALTER TABLE sending_domains ADD COLUMN warmup_start_limit INTEGER NOT NULL DEFAULT 5`);
  safeAddColumn(`ALTER TABLE sending_domains ADD COLUMN warmup_increment INTEGER NOT NULL DEFAULT 5`);
  safeAddColumn(`ALTER TABLE campaigns ADD COLUMN strategy TEXT NOT NULL DEFAULT 'web_design'`);
  safeAddColumn(`ALTER TABLE campaigns ADD COLUMN channels TEXT NOT NULL DEFAULT 'email'`);

  // Replies become an actionable inbox: triage state + AI-classified intent.
  // The index must be created AFTER the column ALTERs (existing DBs lack the
  // column inside the CREATE-TABLE block), so it lives here via safeAddColumn.
  safeAddColumn(`ALTER TABLE replies ADD COLUMN status TEXT NOT NULL DEFAULT 'unread'`);
  safeAddColumn(`ALTER TABLE replies ADD COLUMN intent TEXT`);
  safeAddColumn(`ALTER TABLE replies ADD COLUMN handled_at TEXT`);
  safeAddColumn(`CREATE INDEX IF NOT EXISTS idx_replies_status ON replies(status)`);

  // Multiple agency profiles + per-campaign profile selection
  safeAddColumn(`ALTER TABLE agency_profile ADD COLUMN label TEXT`);
  safeAddColumn(`ALTER TABLE agency_profile ADD COLUMN strategy TEXT NOT NULL DEFAULT 'web_design'`);
  safeAddColumn(`ALTER TABLE agency_profile ADD COLUMN is_default INTEGER NOT NULL DEFAULT 0`);
  safeAddColumn(`ALTER TABLE campaigns ADD COLUMN agency_profile_id INTEGER REFERENCES agency_profile(id)`);

  // Workana replies inbox: belt-and-suspenders for an in-place upgrade of a
  // workana_replies table that predates these columns (fresh installs already
  // get them from the CREATE TABLE above; the index also lives there).
  safeAddColumn(`ALTER TABLE workana_replies ADD COLUMN external_id TEXT`);
  safeAddColumn(`ALTER TABLE workana_replies ADD COLUMN suggested_reply TEXT`);

  // Backfill: ensure exactly one default profile and a usable label.
  try {
    const hasDefault = sqlite
      .prepare(`SELECT COUNT(*) AS n FROM agency_profile WHERE is_default = 1`)
      .get() as { n: number };
    if (hasDefault.n === 0) {
      const first = sqlite
        .prepare(`SELECT id FROM agency_profile ORDER BY id ASC LIMIT 1`)
        .get() as { id: number } | undefined;
      if (first) {
        sqlite.prepare(`UPDATE agency_profile SET is_default = 1 WHERE id = ?`).run(first.id);
      }
    }
    sqlite
      .prepare(`UPDATE agency_profile SET label = COALESCE(NULLIF(name, ''), 'Perfil principal') WHERE label IS NULL OR label = ''`)
      .run();
  } catch { /* table empty or columns just created on a fresh DB */ }

  // One-time: park existing WhatsApp drafts/approveds as "held" when the same
  // lead also has an email (draft/approved/sent). Under the new email-first
  // policy WhatsApp is the fallback, so this prevents historical rows from
  // double-sending on the next cron tick. Runs exactly once (settings marker).
  try {
    const done = sqlite
      .prepare(`SELECT value FROM settings WHERE key = 'held_fallback_migrated'`)
      .get() as { value: string } | undefined;
    if (!done) {
      sqlite.exec(`
        UPDATE whatsapp_messages
        SET status = 'held'
        WHERE status IN ('draft', 'approved')
          AND lead_id IN (
            SELECT lead_id FROM emails WHERE status IN ('draft', 'approved', 'sent')
          )
      `);
      sqlite
        .prepare(`INSERT INTO settings (key, value) VALUES ('held_fallback_migrated', '1')`)
        .run();
    }
  } catch { /* settings/whatsapp tables not ready on a brand-new DB — nothing to migrate */ }

  // One-time: move the send window to the new 10-12 default and seed the
  // scheduling keys, but ONLY if the window is still at the legacy 9-18 default
  // (so a deliberate custom window is never clobbered). Runs once (settings marker).
  try {
    const done = sqlite
      .prepare(`SELECT value FROM settings WHERE key = 'send_schedule_defaults_migrated'`)
      .get() as { value: string } | undefined;
    if (!done) {
      const start = sqlite.prepare(`SELECT value FROM settings WHERE key = 'send_window_start'`).get() as { value: string } | undefined;
      const end = sqlite.prepare(`SELECT value FROM settings WHERE key = 'send_window_end'`).get() as { value: string } | undefined;
      if (start?.value === "9" && end?.value === "18") {
        sqlite.prepare(`UPDATE settings SET value = '10' WHERE key = 'send_window_start'`).run();
        sqlite.prepare(`UPDATE settings SET value = '12' WHERE key = 'send_window_end'`).run();
      }
      // Seed the new scheduling keys if absent (idempotent).
      sqlite.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('send_next_day', 'true')`).run();
      sqlite.prepare(`INSERT OR IGNORE INTO settings (key, value) VALUES ('send_skip_weekends', 'true')`).run();
      sqlite
        .prepare(`INSERT INTO settings (key, value) VALUES ('send_schedule_defaults_migrated', '1')`)
        .run();
    }
  } catch { /* settings table not ready on a brand-new DB — defaults seed it instead */ }
}
