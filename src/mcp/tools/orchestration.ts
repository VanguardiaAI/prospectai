import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db, getSetting, getApiKey } from "@/db";
import { campaigns, leads, emails, whatsappMessages, searchJobs, jobQueue } from "@/db/schema";
import { eq, and, sql, desc, isNotNull } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { checkFullConfig } from "../helpers/validators.js";
import { formatEmailSummary, formatWASummary } from "../helpers/formatters.js";
import { getEffectiveDailyLimit } from "@/lib/cron/warmup";
import { startGoogleMapsSearch } from "../helpers/scraper.js";

export function registerOrchestrationTools(server: McpServer) {
  server.tool(
    "run_campaign",
    "Create a new outreach campaign and optionally start a Google Maps search for leads. This is the high-level tool for starting a full campaign with natural language.",
    {
      campaignName: z.string().min(1).describe("Name for the campaign"),
      searchKeyword: z.string().optional().describe("Google Maps search term (e.g. 'restaurantes en Madrid')"),
      description: z.string().optional().describe("Campaign description"),
      dailyLimit: z.number().int().positive().optional().describe("Daily email limit (default 20)"),
      qualityThreshold: z.number().int().min(0).max(100).optional().describe("Max web quality to contact (default 40)"),
      tone: z.string().optional().describe("Default tone (profesional, casual, etc.)"),
      autopilot: z.boolean().optional().describe("Auto-approve messages"),
    },
    async ({ campaignName, searchKeyword, description, dailyLimit, qualityThreshold, tone, autopilot }) => {
      // 1. Check configuration
      const checks = checkFullConfig();
      const issues = Object.entries(checks)
        .filter(([, c]) => !c.ok)
        .map(([name, c]) => `${name}: ${c.missing.join(", ")}`);

      if (issues.length > 0) {
        return {
          content: [{
            type: "text",
            text: `Cannot run campaign. Missing configuration:\n${issues.join("\n")}\n\nConfigure these in the ProspectAI dashboard or .env file, then try again.`,
          }],
          isError: true,
        };
      }

      // 2. Create campaign (idempotent)
      let campaign = db.select().from(campaigns).where(eq(campaigns.name, campaignName)).get();
      let created = false;

      if (!campaign) {
        campaign = db.insert(campaigns).values({
          name: campaignName,
          description: description ?? null,
          dailyLimit: dailyLimit ?? 20,
          qualityThreshold: qualityThreshold ?? 40,
          autopilot: autopilot ?? false,
          defaultTone: tone ?? "professional",
        }).returning().get();
        created = true;

        logActivity("campaign_change", `Campaign created via MCP: "${campaignName}"`, {
          campaignId: campaign.id,
          messageKey: "activityLog.campaignCreated",
          messageVars: { name: campaignName },
        });
      }

      const lines = [
        created
          ? `Campaign created: [ID:${campaign.id}] "${campaign.name}"`
          : `Using existing campaign: [ID:${campaign.id}] "${campaign.name}" (${campaign.status})`,
      ];

      // 3. Start search if keyword provided
      if (searchKeyword) {
        const result = await startGoogleMapsSearch(searchKeyword, campaign.id);
        if (result.success) {
          lines.push(`\nSearch started: "${searchKeyword}" [Search ID:${result.searchJobId}]`);
          lines.push(`\nNext steps:`);
          lines.push(`1. Use search_and_import_leads with searchJobId=${result.searchJobId} to check results and import`);
          lines.push(`2. Once imported, use process_jobs to scrape and analyze leads`);
          lines.push(`3. Use list_draft_messages to review generated emails`);
          lines.push(`4. Use approve_and_send to approve and queue for sending`);
        } else {
          lines.push(`\nSearch skipped: ${result.error}`);
          lines.push("\nNext steps:");
          lines.push("1. Fix the issue above, then use search_and_import_leads");
          lines.push("2. Or use import_leads_csv to import leads from a CSV file");
        }
      } else {
        lines.push(`\nNext steps:`);
        lines.push(`1. Use search_and_import_leads to find and import leads`);
        lines.push(`2. Or use import_leads_csv to import from CSV`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "search_and_import_leads",
    "Search Google Maps for businesses and import results into a campaign. Can start a new search or poll/import from an existing one.",
    {
      campaignId: z.number().int().describe("Campaign to import leads into"),
      keyword: z.string().optional().describe("Search keyword (starts new search)"),
      searchJobId: z.number().int().optional().describe("Existing search job ID to poll/import"),
    },
    async ({ campaignId, keyword, searchJobId }) => {
      const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
      if (!campaign) return { content: [{ type: "text", text: `Campaign ID ${campaignId} not found.` }], isError: true };

      const scraperUrl = getSetting("gmaps_scraper_url");
      if (!scraperUrl) {
        return { content: [{ type: "text", text: "gmaps_scraper_url not configured. Set it via update_settings." }], isError: true };
      }

      // Poll existing search
      if (searchJobId) {
        const job = db.select().from(searchJobs).where(eq(searchJobs.id, searchJobId)).get();
        if (!job) return { content: [{ type: "text", text: `Search job ID ${searchJobId} not found.` }], isError: true };

        if (job.status === "completed" && job.results) {
          // Import results
          const results = JSON.parse(job.results) as Array<Record<string, unknown>>;
          const { importLeadsFromCSV } = await import("@/lib/csv-importer");

          // Convert results to CSV-like format for the importer
          let imported = 0;
          for (const r of results) {
            try {
              const existing = db.select({ id: leads.id }).from(leads)
                .where(sql`lower(${leads.name}) = lower(${String(r.title || r.name || "")}) AND lower(coalesce(${leads.city}, '')) = lower(${String(r.city || "")})`)
                .get();
              if (existing) continue;

              const lead = db.insert(leads).values({
                campaignId,
                name: String(r.title || r.name || "Unknown"),
                category: r.category ? String(r.category) : null,
                phone: r.phone ? String(r.phone) : null,
                email: r.email ? String(r.email) : null,
                website: r.site || r.website ? String(r.site || r.website) : null,
                address: r.full_address || r.address ? String(r.full_address || r.address) : null,
                city: r.city ? String(r.city) : null,
                state: r.state ? String(r.state) : null,
                rating: r.rating ? Number(r.rating) : null,
                reviewCount: r.reviews || r.review_count ? Number(r.reviews || r.review_count) : null,
                googleMapsUrl: r.place_url || r.url ? String(r.place_url || r.url) : null,
                status: "imported",
              }).returning().get();

              if (lead.website) {
                db.insert(jobQueue).values({ type: "scrape", leadId: lead.id, campaignId }).run();
              }
              imported++;
            } catch { /* skip individual errors */ }
          }

          logActivity("import", `Imported ${imported} leads from search into campaign "${campaign.name}"`, {
            campaignId,
            metadata: { searchJobId, imported, total: results.length },
            messageKey: "activityLog.importedFromSearch",
            messageVars: { count: imported, keyword: campaign.name },
          });

          return {
            content: [{
              type: "text",
              text: `Imported ${imported} leads from ${results.length} search results into campaign "${campaign.name}".\n\nNext: Use process_jobs to scrape and analyze the leads.`,
            }],
          };
        }

        if (job.status === "pending" || job.status === "running") {
          // Poll scraper for status
          try {
            const res = await fetch(`${scraperUrl}/api/v1/results/${job.scraperJobId}`, {
              signal: AbortSignal.timeout(10000),
            });

            if (res.ok) {
              const data = await res.json();
              if (data.status === "complete" || data.status === "ok") {
                const results = data.results || data.data || [];
                db.update(searchJobs).set({
                  status: "completed",
                  results: JSON.stringify(results),
                  resultCount: results.length,
                  completedAt: new Date().toISOString(),
                }).where(eq(searchJobs.id, searchJobId)).run();

                return {
                  content: [{
                    type: "text",
                    text: `Search completed: ${results.length} results found.\nCall this tool again with the same searchJobId to import the results.`,
                  }],
                };
              } else {
                return { content: [{ type: "text", text: `Search still in progress (status: ${data.status}). Try again in a minute.` }] };
              }
            } else {
              return { content: [{ type: "text", text: `Scraper returned HTTP ${res.status}. Search may still be running.` }] };
            }
          } catch (e) {
            return { content: [{ type: "text", text: `Could not poll scraper: ${e instanceof Error ? e.message : "unknown"}. Try again later.` }] };
          }
        }

        if (job.status === "failed") {
          return { content: [{ type: "text", text: `Search job failed: ${job.error || "unknown error"}. Start a new search with a keyword.` }], isError: true };
        }

        return { content: [{ type: "text", text: `Search status: ${job.status}` }] };
      }

      // Start new search
      if (keyword) {
        const result = await startGoogleMapsSearch(keyword, campaignId);
        if (!result.success) {
          return { content: [{ type: "text", text: result.error! }], isError: true };
        }

        return {
          content: [{
            type: "text",
            text: `Search started: "${keyword}" [Search ID:${result.searchJobId}]\n\nUse search_and_import_leads with searchJobId=${result.searchJobId} to poll results and import.`,
          }],
        };
      }

      return { content: [{ type: "text", text: "Provide either a keyword to start a new search or a searchJobId to poll/import existing results." }] };
    }
  );

  server.tool(
    "generate_outreach",
    "Generate personalized email and/or WhatsApp messages for eligible leads in a campaign. Returns previews of generated messages.",
    {
      campaignId: z.number().int().optional().describe("Campaign to generate outreach for"),
      leadIds: z.array(z.number().int()).max(10).optional().describe("Specific lead IDs (max 10)"),
      channels: z.array(z.enum(["email", "whatsapp"])).optional().describe("Channels to generate for (default: email)"),
      tone: z.string().optional().describe("Override tone"),
      customInstructions: z.string().optional().describe("Custom instructions for the AI"),
    },
    async ({ campaignId, leadIds, channels = ["email"], tone, customInstructions }) => {
      if (!getApiKey("gemini_api_key", "GEMINI_API_KEY")) {
        return { content: [{ type: "text", text: "Cannot generate: GEMINI_API_KEY not configured." }], isError: true };
      }

      // Find eligible leads
      let eligibleLeads;
      if (leadIds?.length) {
        eligibleLeads = db.select().from(leads)
          .where(sql`${leads.id} IN (${sql.join(leadIds.map(id => sql`${id}`), sql`, `)})`)
          .all();
      } else if (campaignId) {
        eligibleLeads = db.select().from(leads)
          .where(and(
            eq(leads.campaignId, campaignId),
            eq(leads.status, "analyzed"),
          ))
          .limit(10)
          .all();
      } else {
        return { content: [{ type: "text", text: "Provide campaignId or leadIds." }] };
      }

      if (eligibleLeads.length === 0) {
        return { content: [{ type: "text", text: "No eligible leads found. Leads must be in 'analyzed' status with contact info." }] };
      }

      const { generateEmail, generateWhatsApp, defaultWebAnalysis } = await import("@/lib/gemini");
      const { isBlacklisted } = await import("@/lib/blacklist");
      const { isUnsubscribed } = await import("@/lib/unsubscribe");

      const fromName = getSetting("from_name") || getSetting("agency_name") || "ProspectAI";
      const fromEmail = getSetting("from_email") || "";
      const defaultTone = tone || getSetting("default_tone") || "professional";

      const previews: string[] = [];
      let emailCount = 0;
      let waCount = 0;

      // Resolve each campaign's agency profile once (leads may span campaigns via leadIds)
      const profileCache = new Map<number, number | null>();
      const resolveProfileId = (campaignId: number | null): number | undefined => {
        if (!campaignId) return undefined;
        if (!profileCache.has(campaignId)) {
          const c = db.select({ pid: campaigns.agencyProfileId }).from(campaigns).where(eq(campaigns.id, campaignId)).get();
          profileCache.set(campaignId, c?.pid ?? null);
        }
        return profileCache.get(campaignId) ?? undefined;
      };

      for (const lead of eligibleLeads) {
        const contactEmail = lead.contactEmail || lead.extractedEmail || lead.email;
        const analysis = lead.analysisJson ? JSON.parse(lead.analysisJson) : defaultWebAnalysis(lead.website, lead.webQualityScore ?? 0, lead.analysisSummary ?? "");
        const agencyProfileId = resolveProfileId(lead.campaignId);

        // Check for existing drafts to prevent duplicates
        const existingEmail = contactEmail ? db.select({ id: emails.id }).from(emails)
          .where(and(eq(emails.leadId, lead.id), eq(emails.status, "draft"))).get() : undefined;
        const existingWA = lead.phone ? db.select({ id: whatsappMessages.id }).from(whatsappMessages)
          .where(and(eq(whatsappMessages.leadId, lead.id), eq(whatsappMessages.status, "draft"))).get() : undefined;

        // Generate email
        if (channels.includes("email") && contactEmail) {
          if (existingEmail) {
            previews.push(`[SKIPPED] ${lead.name}: already has email draft`);
          } else if (isBlacklisted(contactEmail, lead.website ?? undefined, lead.name)) {
            previews.push(`[SKIPPED] ${lead.name} email: blacklisted`);
          } else if (isUnsubscribed(contactEmail)) {
            previews.push(`[SKIPPED] ${lead.name} email: unsubscribed`);
          } else {
            try {
              const result = await generateEmail(
                lead.name, lead.category, lead.city, lead.website, analysis,
                defaultTone, fromName, undefined, customInstructions, undefined, agencyProfileId
              );

              db.insert(emails).values({
                leadId: lead.id,
                campaignId: lead.campaignId,
                toEmail: contactEmail,
                fromEmail,
                subject: result.subject,
                bodyHtml: result.bodyHtml,
                bodyText: result.bodyText,
                tone: defaultTone,
                status: "draft",
              }).run();

              db.update(leads).set({ status: "email_generated" }).where(eq(leads.id, lead.id)).run();
              logActivity("email_generated", `Email generated via MCP for ${lead.name}`, { leadId: lead.id, campaignId: lead.campaignId ?? undefined, messageKey: "activityLog.emailGeneratedFor", messageVars: { name: lead.name } });
              previews.push(`[EMAIL] ${lead.name}: "${result.subject}"`);
              emailCount++;
            } catch (e) {
              previews.push(`[ERROR] ${lead.name} email: ${e instanceof Error ? e.message : "unknown"}`);
            }
          }
        }

        // Generate WhatsApp (independent of email blacklist/unsubscribe status)
        if (channels.includes("whatsapp") && lead.phone) {
          if (existingWA) {
            previews.push(`[SKIPPED] ${lead.name}: already has WA draft`);
          } else if (isBlacklisted(undefined, undefined, lead.name)) {
            previews.push(`[SKIPPED] ${lead.name} WA: blacklisted`);
          } else {
            try {
              const result = await generateWhatsApp(
                lead.name, lead.category, lead.city, lead.website, analysis,
                defaultTone, fromName, undefined, customInstructions, undefined, agencyProfileId
              );

              db.insert(whatsappMessages).values({
                leadId: lead.id,
                campaignId: lead.campaignId,
                toPhone: lead.phone,
                body: result.message,
                tone: defaultTone,
                status: "draft",
              }).run();

              logActivity("wa_generated", `WhatsApp generated via MCP for ${lead.name}`, { leadId: lead.id, campaignId: lead.campaignId ?? undefined, messageKey: "activityLog.waGeneratedFor", messageVars: { name: lead.name } });
              previews.push(`[WA] ${lead.name}: "${result.message.slice(0, 80)}..."`);
              waCount++;
            } catch (e) {
              previews.push(`[ERROR] ${lead.name} WA: ${e instanceof Error ? e.message : "unknown"}`);
            }
          }
        }
      }

      const lines = [
        `# Outreach Generated\n`,
        `Emails: ${emailCount} | WhatsApp: ${waCount}\n`,
        `## Previews`,
        ...previews,
        `\nAll messages are in DRAFT status. Use list_draft_messages to review full content.`,
        `Use approve_messages with specific IDs to approve for sending.`,
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "approve_and_send",
    "Review and approve campaign messages. When only campaignId is provided, LISTS all drafts for review. Use approve_messages to approve specific IDs or all drafts in a campaign.",
    {
      campaignId: z.number().int().describe("Campaign to review drafts from"),
    },
    async ({ campaignId }) => {
      const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
      if (!campaign) return { content: [{ type: "text", text: `Campaign ID ${campaignId} not found.` }], isError: true };

      const draftEmails = db.select({
        id: emails.id, subject: emails.subject, toEmail: emails.toEmail,
        leadId: emails.leadId, bodyText: emails.bodyText, bodyHtml: emails.bodyHtml,
        tone: emails.tone, status: emails.status, createdAt: emails.createdAt,
        fromEmail: emails.fromEmail,
      }).from(emails)
        .where(and(eq(emails.campaignId, campaignId), eq(emails.status, "draft")))
        .orderBy(desc(emails.createdAt))
        .limit(20)
        .all();

      const draftWA = db.select({
        id: whatsappMessages.id, body: whatsappMessages.body, toPhone: whatsappMessages.toPhone,
        leadId: whatsappMessages.leadId, tone: whatsappMessages.tone, status: whatsappMessages.status,
        createdAt: whatsappMessages.createdAt,
      }).from(whatsappMessages)
        .where(and(eq(whatsappMessages.campaignId, campaignId), eq(whatsappMessages.status, "draft")))
        .orderBy(desc(whatsappMessages.createdAt))
        .limit(20)
        .all();

      // Remaining quota
      const today = new Date().toISOString().split("T")[0];
      const emailSentToday = db.select({ count: sql<number>`count(*)` }).from(emails)
        .where(and(eq(emails.status, "sent"), sql`date(${emails.sentAt}) = ${today}`)).get()?.count ?? 0;
      const effectiveLimit = getEffectiveDailyLimit();

      const lines = [`# Drafts for "${campaign.name}" [ID:${campaignId}]\n`];

      if (draftEmails.length > 0) {
        lines.push(`## Email Drafts (${draftEmails.length})`);
        for (const e of draftEmails) {
          const lead = db.select({ name: leads.name }).from(leads).where(eq(leads.id, e.leadId)).get();
          lines.push(formatEmailSummary(e, lead?.name ?? "Unknown"));
        }
      }

      if (draftWA.length > 0) {
        lines.push(`\n## WhatsApp Drafts (${draftWA.length})`);
        for (const w of draftWA) {
          const lead = db.select({ name: leads.name }).from(leads).where(eq(leads.id, w.leadId)).get();
          lines.push(formatWASummary(w, lead?.name ?? "Unknown"));
        }
      }

      if (draftEmails.length === 0 && draftWA.length === 0) {
        lines.push("No drafts found for this campaign.");
      } else {
        lines.push(`\nEmail quota remaining today: ${Math.max(0, effectiveLimit - emailSentToday)} / ${effectiveLimit}`);
        lines.push(`\nTo approve specific messages: approve_messages(emailIds=[...], whatsappIds=[...])`);
        lines.push(`To approve ALL drafts: approve_messages(campaignId=${campaignId})`);
        lines.push(`To reject: reject_messages(emailIds=[...], whatsappIds=[...])`);
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
