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
  // Status
  status: text("status", {
    enum: ["draft", "approved", "rejected", "sent", "failed"],
  }).notNull().default("draft"),
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
  status: text("status", {
    enum: ["draft", "approved", "rejected", "sent", "failed"],
  }).notNull().default("draft"),
  waMessageId: text("wa_message_id"),
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
  receivedAt: text("received_at").notNull().default(sql`(datetime('now'))`),
  createdAt: text("created_at").notNull().default(sql`(datetime('now'))`),
});
