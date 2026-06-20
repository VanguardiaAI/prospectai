import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

export const campaigns = sqliteTable("campaigns", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  description: text("description"),
  dailyLimit: integer("daily_limit").notNull().default(20),
  qualityThreshold: integer("quality_threshold").notNull().default(40),
  autopilot: integer("autopilot", { mode: "boolean" }).notNull().default(false),
  defaultTone: text("default_tone").notNull().default("professional"),
  // Campaign angle: "web_design" pitches the website, "seo_visibility" pitches Google visibility (recurring SEO).
  // Mirrored from the selected agency profile's own angle; kept as a non-destructive fallback.
  strategy: text("strategy", { enum: ["web_design", "seo_visibility"] }).notNull().default("web_design"),
  // Agency profile (identity + angle) this campaign writes as. NULL = fall back to the default profile.
  agencyProfileId: integer("agency_profile_id").references(() => agencyProfile.id),
  // Outreach channels this campaign uses — comma-separated list of "email" / "whatsapp"
  // (e.g. "email", "whatsapp", "email,whatsapp"). Drives the channel-gated service warnings.
  channels: text("channels").notNull().default("email"),
  status: text("status", { enum: ["active", "paused", "archived"] }).notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const leads = sqliteTable("leads", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  // Business info from CSV
  name: text("name").notNull(),
  category: text("category"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  address: text("address"),
  city: text("city"),
  state: text("state"),
  rating: real("rating"),
  reviewCount: integer("review_count"),
  googleMapsUrl: text("google_maps_url"),
  // Extracted during scraping
  extractedEmail: text("extracted_email"),
  contactEmail: text("contact_email"), // Final email to use (manual override or extracted)
  // Analysis
  webQualityScore: integer("web_quality_score"), // 0-100 (0 = no web, 100 = excellent)
  opportunityScore: integer("opportunity_score"), // 0-100
  analysisJson: text("analysis_json"), // Full analysis from Gemini
  analysisSummary: text("analysis_summary"),
  // Status
  status: text("status", {
    enum: ["imported", "queued", "scraping", "scraped", "analyzing", "analyzed", "email_generated", "email_approved", "email_sent", "wa_generated", "wa_approved", "wa_sent", "contacted", "replied", "rejected", "blacklisted", "error"],
  }).notNull().default("imported"),
  errorMessage: text("error_message"),
  notes: text("notes"),
  // Where the lead came from: "search" (Google Maps) | "csv" | "manual".
  source: text("source"),
  // Free-form classification tags as a JSON array string, e.g. ["dermatólogo","CDMX"].
  tags: text("tags"),
  // Timestamps
  importedAt: text("imported_at").notNull().default(sql`(datetime('now'))`),
  scrapedAt: text("scraped_at"),
  analyzedAt: text("analyzed_at"),
  emailSentAt: text("email_sent_at"),
  waSentAt: text("wa_sent_at"),
});

export const emails = sqliteTable("emails", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  // Email content
  toEmail: text("to_email").notNull(),
  fromEmail: text("from_email"),
  subject: text("subject").notNull(),
  bodyHtml: text("body_html").notNull(),
  bodyText: text("body_text").notNull(),
  tone: text("tone").notNull().default("professional"),
  // Status. "held" = parked fallback: a message kept out of the approve/send
  // pools because the lead's primary channel goes first (see outreach-policy).
  status: text("status", {
    enum: ["draft", "approved", "rejected", "sent", "failed", "held"],
  }).notNull().default("draft"),
  // Conscious override: this company was already contacted elsewhere, but the
  // user approved sending anyway. See contact-history / the duplicate guard.
  dupAck: integer("dup_ack", { mode: "boolean" }).notNull().default(false),
  // Scheduled send instant (ISO-UTC). Set on approval to defer sending to the
  // configured window (see lib/cron/send-schedule). NULL = send asap (legacy
  // rows + manual overrides). The sender only picks up rows whose time is due.
  scheduledFor: text("scheduled_for"),
  // Tracking
  resendId: text("resend_id"),
  sentAt: text("sent_at"),
  openedAt: text("opened_at"),
  clickedAt: text("clicked_at"),
  // Timestamps
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const blacklist = sqliteTable("blacklist", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["domain", "email", "business"] }).notNull(),
  value: text("value").notNull().unique(),
  reason: text("reason"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const whatsappMessages = sqliteTable("whatsapp_messages", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  toPhone: text("to_phone").notNull(),
  body: text("body").notNull(),
  tone: text("tone").notNull().default("professional"),
  // "held" = parked fallback: WhatsApp waits while email (the primary channel)
  // goes first; released by the channel-fallback cron or manually. See outreach-policy.
  status: text("status", {
    enum: ["draft", "approved", "rejected", "sent", "failed", "held"],
  }).notNull().default("draft"),
  // Conscious override for the already-contacted guard (see contact-history).
  dupAck: integer("dup_ack", { mode: "boolean" }).notNull().default(false),
  // Scheduled send instant (ISO-UTC). See emails.scheduledFor.
  scheduledFor: text("scheduled_for"),
  waMessageId: text("wa_message_id"),
  // Why the last send attempt failed (e.g. "número no registrado en WhatsApp").
  errorMessage: text("error_message"),
  sentAt: text("sent_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const activityLog = sqliteTable("activity_log", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", {
    enum: ["import", "scrape", "analyze", "email_generated", "email_approved", "email_rejected", "email_sent", "email_failed", "wa_generated", "wa_approved", "wa_rejected", "wa_sent", "wa_failed", "blacklist", "setting_change", "campaign_change", "lead_prioritized", "error"],
  }).notNull(),
  message: text("message").notNull(),
  leadId: integer("lead_id"),
  campaignId: integer("campaign_id"),
  metadata: text("metadata"), // JSON
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const settings = sqliteTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const agencyProfile = sqliteTable("agency_profile", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Internal nickname used in the profile picker (the public `name` may repeat across profiles)
  label: text("label"),
  // Messaging angle this profile writes with: "web_design" or "seo_visibility"
  strategy: text("strategy", { enum: ["web_design", "seo_visibility"] }).notNull().default("web_design"),
  // Exactly one profile is the default (fallback for campaigns without a profile, onboarding, and no-campaign context)
  isDefault: integer("is_default", { mode: "boolean" }).notNull().default(false),
  // Identity
  name: text("name"),
  url: text("url"),
  description: text("description"),
  tagline: text("tagline"), // value-prop one-liner
  // Owner / signer
  ownerName: text("owner_name"),
  ownerRole: text("owner_role"),
  contactEmail: text("contact_email"),
  contactPhone: text("contact_phone"),
  // Services
  services: text("services"), // comma-separated keys (web_development,seo,...)
  customServices: text("custom_services"), // JSON array of {label, description}
  // Location
  city: text("city"),
  country: text("country"),
  // Differentiators
  valueProps: text("value_props"), // JSON array of strings
  caseStudies: text("case_studies"), // JSON array of {client, result, snippet}
  // Onboarding metadata
  source: text("source", { enum: ["url", "manual", "skipped"] }),
  sourceUrl: text("source_url"),
  extractedAt: text("extracted_at"),
  completedAt: text("completed_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const searchJobs = sqliteTable("search_jobs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  scraperJobId: text("scraper_job_id"), // ID from google-maps-scraper API
  keyword: text("keyword").notNull(),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  status: text("status", {
    enum: ["pending", "running", "completed", "failed"],
  }).notNull().default("pending"),
  resultCount: integer("result_count").default(0),
  results: text("results"), // JSON array of place results from scraper
  error: text("error"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  completedAt: text("completed_at"),
});

export const sequenceSteps = sqliteTable("sequence_steps", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id),
  stepNumber: integer("step_number").notNull().default(1),
  channel: text("channel", { enum: ["email", "whatsapp"] }).notNull().default("email"),
  delayDays: integer("delay_days").notNull().default(3), // Days after previous step
  tone: text("tone").notNull().default("professional"),
  customInstructions: text("custom_instructions"), // Extra instructions for AI generation
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const sequenceEnrollments = sqliteTable("sequence_enrollments", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  campaignId: integer("campaign_id").notNull().references(() => campaigns.id),
  currentStep: integer("current_step").notNull().default(1),
  status: text("status", { enum: ["active", "completed", "replied", "unsubscribed", "paused"] }).notNull().default("active"),
  nextActionAt: text("next_action_at"), // When to execute next step
  enrolledAt: text("enrolled_at").notNull().default(sql`(datetime('now'))`),
  completedAt: text("completed_at"),
});

export const unsubscribes = sqliteTable("unsubscribes", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  email: text("email").notNull(),
  token: text("token").notNull().unique(),
  leadId: integer("lead_id").references(() => leads.id),
  unsubscribedAt: text("unsubscribed_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const jobQueue = sqliteTable("job_queue", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  type: text("type", { enum: ["scrape", "analyze", "generate_email", "send_email", "generate_wa", "send_wa"] }).notNull(),
  leadId: integer("lead_id").references(() => leads.id),
  campaignId: integer("campaign_id"),
  status: text("status", { enum: ["pending", "processing", "completed", "failed"] }).notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
  maxAttempts: integer("max_attempts").notNull().default(3),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  processedAt: text("processed_at"),
});

// --- A/B Testing ---

export const abVariants = sqliteTable("ab_variants", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  name: text("name").notNull(),
  variantA: text("variant_a").notNull(), // JSON: { tone, instructions }
  variantB: text("variant_b").notNull(), // JSON: { tone, instructions }
  channel: text("channel", { enum: ["email", "whatsapp", "both"] }).notNull().default("email"),
  status: text("status", { enum: ["active", "completed"] }).notNull().default("active"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

export const abResults = sqliteTable("ab_results", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  variantId: integer("variant_id").notNull().references(() => abVariants.id),
  emailId: integer("email_id").references(() => emails.id),
  whatsappMessageId: integer("whatsapp_message_id"),
  variantGroup: text("variant_group", { enum: ["A", "B"] }).notNull(),
  opened: integer("opened", { mode: "boolean" }).notNull().default(false),
  clicked: integer("clicked", { mode: "boolean" }).notNull().default(false),
  replied: integer("replied", { mode: "boolean" }).notNull().default(false),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// --- Sending Domains ---

export const sendingDomains = sqliteTable("sending_domains", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  domain: text("domain").notNull(),
  fromEmail: text("from_email").notNull(),
  fromName: text("from_name").notNull(),
  dailyLimit: integer("daily_limit").notNull().default(30),
  warmupDay: integer("warmup_day").notNull().default(1),
  warmupStartLimit: integer("warmup_start_limit").notNull().default(5),
  warmupIncrement: integer("warmup_increment").notNull().default(5),
  status: text("status", { enum: ["active", "warming", "paused"] }).notNull().default("active"),
  resendApiKey: text("resend_api_key"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// --- Email Templates ---

export const emailTemplates = sqliteTable("email_templates", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  name: text("name").notNull(),
  channel: text("channel", { enum: ["email", "whatsapp"] }).notNull().default("email"),
  category: text("category"),
  subjectTemplate: text("subject_template").notNull(),
  bodyHtmlTemplate: text("body_html_template").notNull(),
  bodyTextTemplate: text("body_text_template").notNull(),
  variables: text("variables"), // JSON array: ["business_name", "city", "issue"]
  usageCount: integer("usage_count").notNull().default(0),
  avgOpenRate: real("avg_open_rate"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// --- Replies ---

export const rateLimits = sqliteTable("rate_limits", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  key: text("key").notNull(), // e.g. "login:192.168.1.1"
  attempts: integer("attempts").notNull().default(0),
  lockedUntil: text("locked_until"), // ISO timestamp
  windowStart: text("window_start").notNull(), // ISO timestamp
});

export const replies = sqliteTable("replies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leadId: integer("lead_id").notNull().references(() => leads.id),
  campaignId: integer("campaign_id").references(() => campaigns.id),
  channel: text("channel", { enum: ["email", "whatsapp"] }).notNull(),
  fromAddress: text("from_address").notNull(), // email or phone
  body: text("body"),
  // AI-drafted reply for the user to review, edit and approve. Sending it creates
  // an outbound emails/whatsapp_messages row and marks this reply "handled".
  suggestedReply: text("suggested_reply"),
  suggestedReplyAt: text("suggested_reply_at"),
  // Triage state + AI-classified intent so replies become an actionable inbox,
  // not just a read-only log.
  status: text("status", { enum: ["unread", "handled"] }).notNull().default("unread"),
  intent: text("intent", {
    enum: ["interested", "question", "not_interested", "auto_reply", "unsubscribe", "other"],
  }),
  handledAt: text("handled_at"),
  receivedAt: text("received_at").notNull().default(sql`(datetime('now'))`),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});

// --- Portfolio knowledge base ---
// Structured past projects (richer than agency_profile.case_studies) plus an
// AI-driven "interview" that asks the user for missing proof. Both feed the
// agency context block so proposals/emails/replies can cite concrete work.

export const portfolioProjects = sqliteTable("portfolio_projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // NULL = shared across every agency profile (the default). Otherwise scoped to
  // one profile's angle so the relevance ranking can prefer it for that profile.
  agencyProfileId: integer("agency_profile_id").references(() => agencyProfile.id),
  title: text("title").notNull(),
  client: text("client"), // client/company name (may be anonymized)
  sector: text("sector"), // industry/vertical — used for relevance matching
  description: text("description"), // free-form project description (as written on the site)
  problem: text("problem"), // the challenge/need the client had
  solution: text("solution"), // what we built / our approach
  services: text("services"), // JSON array of service keys involved
  stack: text("stack"), // JSON array of tech/tools used
  deliverables: text("deliverables"),
  result: text("result"), // measurable outcome
  metric: text("metric"), // headline metric ("3x tráfico", "+40% reservas")
  testimonial: text("testimonial"), // client quote
  testimonialAuthor: text("testimonial_author"),
  projectUrl: text("project_url"), // live site / case-study page
  durationLabel: text("duration_label"), // e.g. "6 semanas"
  tags: text("tags"), // JSON array of free tags for matching
  notes: text("notes"), // free-form extra context (captured via the interview)
  highlight: integer("highlight", { mode: "boolean" }).notNull().default(false), // flagship pin
  source: text("source", { enum: ["scraped", "manual", "enriched"] }).notNull().default("manual"),
  sourceUrl: text("source_url"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const profileEnrichment = sqliteTable("profile_enrichment", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Either agency-wide (projectId NULL) or scoped to a specific project.
  agencyProfileId: integer("agency_profile_id").references(() => agencyProfile.id),
  projectId: integer("project_id").references(() => portfolioProjects.id),
  question: text("question").notNull(),
  answer: text("answer"), // NULL until the user answers
  category: text("category", {
    enum: ["proof", "process", "differentiation", "pricing", "logistics", "other"],
  }).notNull().default("other"),
  priority: integer("priority").notNull().default(3), // AI-assigned importance, lower = ask first
  status: text("status", { enum: ["pending", "answered", "skipped"] }).notNull().default("pending"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  answeredAt: text("answered_at"),
});

// --- Workana add-on (optional) ---
// Assisted bidding on Workana projects. Decoupled design: Playwright drives the
// browser, `generateStructured` only reasons over extracted text. Opt-in via the
// `workana_enabled` setting. See docs/workana-addon-plan.md.

export const workanaSearches = sqliteTable("workana_searches", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Internal nickname for the saved search (e.g. "Diseño web" vs "SEO/visibilidad")
  label: text("label"),
  // Persona this search writes proposals as (reuses the agency profile model)
  agencyProfileId: integer("agency_profile_id").references(() => agencyProfile.id),
  strategy: text("strategy", { enum: ["web_design", "seo_visibility"] }).notNull().default("web_design"),
  filters: text("filters"), // JSON: { categories, skills, keywords, minBudget, maxBudget, ... }
  language: text("language").notNull().default("auto"), // auto | es | pt | en — draft language hint
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const workanaProjects = sqliteTable("workana_projects", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  // Workana's own project id/slug — unique, used to dedup across scan runs
  workanaProjectId: text("workana_project_id").notNull().unique(),
  searchId: integer("search_id").references(() => workanaSearches.id),
  url: text("url"),
  title: text("title").notNull(),
  description: text("description"),
  category: text("category"),
  skills: text("skills"), // JSON array
  budgetType: text("budget_type"), // fixed | hourly | unknown
  budgetMin: real("budget_min"),
  budgetMax: real("budget_max"),
  currency: text("currency"),
  clientCountry: text("client_country"),
  clientInfo: text("client_info"), // JSON: { name, rating, paymentVerified, hires, ... }
  bidsCount: integer("bids_count"),
  language: text("language"), // detected project language
  rawText: text("raw_text"), // extracted page text fed to the AI evaluator
  fitScore: integer("fit_score"), // 0-100
  shouldBid: integer("should_bid", { mode: "boolean" }),
  reason: text("reason"),
  status: text("status", {
    enum: ["new", "evaluated", "skipped", "drafted", "submitted", "replied", "closed", "error"],
  }).notNull().default("new"),
  publishedAt: text("published_at"),
  scannedAt: text("scanned_at"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const workanaProposals = sqliteTable("workana_proposals", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").notNull().references(() => workanaProjects.id),
  agencyProfileId: integer("agency_profile_id").references(() => agencyProfile.id),
  coverLetter: text("cover_letter").notNull(),
  bidAmount: real("bid_amount"),
  currency: text("currency"),
  deliveryDays: integer("delivery_days"),
  screeningAnswers: text("screening_answers"), // JSON array [{ question, answer }]
  confidence: integer("confidence"), // 0-100
  status: text("status", {
    // "sending" is a crash-safe claim: set BEFORE the (slow) real send so that a
    // restart mid-send leaves it here (not "approved") and it is never auto-re-sent.
    enum: ["draft", "approved", "rejected", "sending", "submitted", "failed"],
  }).notNull().default("draft"),
  submittedAt: text("submitted_at"),
  workanaProposalRef: text("workana_proposal_ref"),
  errorMessage: text("error_message"),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
  updatedAt: text("updated_at").notNull().default(sql`(datetime('now'))`),
});

export const workanaReplies = sqliteTable("workana_replies", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  projectId: integer("project_id").references(() => workanaProjects.id),
  proposalId: integer("proposal_id").references(() => workanaProposals.id),
  // Stable dedup key (thread url + message hash) so re-scans don't duplicate.
  externalId: text("external_id"),
  fromName: text("from_name"),
  body: text("body"),
  // AI-suggested reply for the user to review/copy (never auto-sent).
  suggestedReply: text("suggested_reply"),
  // Same triage shape as `replies` (reuses classifyReply / INTENT_TONE helpers).
  status: text("status", { enum: ["unread", "handled"] }).notNull().default("unread"),
  intent: text("intent", {
    enum: ["interested", "question", "not_interested", "auto_reply", "unsubscribe", "other"],
  }),
  handledAt: text("handled_at"),
  receivedAt: text("received_at").notNull().default(sql`(datetime('now'))`),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});
