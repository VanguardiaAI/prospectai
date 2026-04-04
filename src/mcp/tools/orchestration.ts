import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db, getSetting } from "@/db";
import { campaigns, leads, emails, whatsappMessages, searchJobs, jobQueue } from "@/db/schema";
import { eq, and, sql, desc, isNotNull } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { checkFullConfig } from "../helpers/validators.js";
import { formatEmailSummary, formatWASummary } from "../helpers/formatters.js";
import { getEffectiveDailyLimit } from "@/lib/cron/warmup";

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
          defaultTone: tone ?? "profesional",
        }).returning().get();
        created = true;

        logActivity("campaign_change", `Campaign created via MCP: "${campaignName}"`, {
          campaignId: campaign.id,
        });
      }

      const lines = [
        created
          ? `Campaign created: [ID:${campaign.id}] "${campaign.name}"`
          : `Using existing campaign: [ID:${campaign.id}] "${campaign.name}" (${campaign.status})`,
      ];

      // 3. Start search if keyword provided
      if (searchKeyword) {
        const scraperUrl = getSetting("gmaps_scraper_url");
        if (!scraperUrl) {
          lines.push("\nSearch skipped: gmaps_scraper_url not configured.");
          lines.push("\nNext steps:");
          lines.push("1. Configure the scraper URL in settings");
          lines.push("2. Use search_and_import_leads to search and import leads");
          lines.push("3. Or use import_leads_csv to import leads from a CSV file");
        } else {
          try {
            const formData = new URLSearchParams();
            formData.set("name", `prospectai-${Date.now()}`);
            formData.set("keywords", searchKeyword.trim());
            formData.set("lang", "es");
            formData.set("depth", "5");
            formData.set("email", "on");
            formData.set("maxtime", "10m");
            formData.set("zoom", "15");
            formData.set("latitude", "0");
            formData.set("longitude", "0");
            formData.set("radius", "10000");

            const scraperRes = await fetch(`${scraperUrl}/scrape`, {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: formData.toString(),
            });

            if (scraperRes.ok) {
              const html = await scraperRes.text();
              const match = html.match(/<td>([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})<\/td>/);
              const scraperJobId = match?.[1];

              if (scraperJobId) {
                const searchJob = db.insert(searchJobs).values({
                  scraperJobId,
                  keyword: searchKeyword.trim(),
                  campaignId: campaign.id,
                  status: "pending",
                }).returning().get();

                logActivity("import", `Search started via MCP: "${searchKeyword}"`, {
                  campaignId: campaign.id,
                  metadata: { searchJobId: searchJob.id },
                });

                lines.push(`\nSearch started: "${searchKeyword}" [Search ID:${searchJob.id}]`);
                lines.push(`\nNext steps:`);
                lines.push(`1. Use search_and_import_leads with searchJobId=${searchJob.id} to check results and import`);
                lines.push(`2. Once imported, use process_jobs to scrape and analyze leads`);
                lines.push(`3. Use list_draft_messages to review generated emails`);
                lines.push(`4. Use approve_and_send to approve and queue for sending`);
              } else {
                lines.push("\nSearch submitted but could not parse job ID from scraper response.");
              }
            } else {
              lines.push(`\nSearch failed: scraper returned HTTP ${scraperRes.status}`);
            }
          } catch (e) {
            lines.push(`\nSearch error: ${e instanceof Error ? e.message : "connection failed"}. Is the scraper running?`);
          }
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
        try {
          const formData = new URLSearchParams();
          formData.set("name", `prospectai-${Date.now()}`);
          formData.set("keywords", keyword.trim());
          formData.set("lang", "es");
          formData.set("depth", "5");
          formData.set("email", "on");
          formData.set("maxtime", "10m");
          formData.set("zoom", "15");
          formData.set("latitude", "0");
          formData.set("longitude", "0");
          formData.set("radius", "10000");

          const res = await fetch(`${scraperUrl}/scrape`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: formData.toString(),
          });

          if (!res.ok) {
            return { content: [{ type: "text", text: `Scraper error: HTTP ${res.status}` }], isError: true };
          }

          const html = await res.text();
          const match = html.match(/<td>([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})<\/td>/);

          if (!match?.[1]) {
            return { content: [{ type: "text", text: "Search submitted but could not parse job ID." }], isError: true };
          }

          const job = db.insert(searchJobs).values({
            scraperJobId: match[1],
            keyword: keyword.trim(),
            campaignId,
            status: "pending",
          }).returning().get();

          logActivity("import", `Search started via MCP: "${keyword}"`, { campaignId });

          return {
            content: [{
              type: "text",
              text: `Search started: "${keyword}" [Search ID:${job.id}]\n\nUse search_and_import_leads with searchJobId=${job.id} to poll results and import.`,
            }],
          };
        } catch (e) {
          return {
            content: [{ type: "text", text: `Search error: ${e instanceof Error ? e.message : "connection failed"}. Is the scraper running?` }],
            isError: true,
          };
        }
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
      if (!process.env.GEMINI_API_KEY) {
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

      const fromName = getSetting("from_name") || getSetting("agency_name") || "VanguardIA";
      const fromEmail = getSetting("from_email") || "hola@vanguardia.dev";
      const defaultTone = tone || getSetting("default_tone") || "profesional";

      const previews: string[] = [];
      let emailCount = 0;
      let waCount = 0;

      for (const lead of eligibleLeads) {
        const contactEmail = lead.contactEmail || lead.extractedEmail || lead.email;
        const analysis = lead.analysisJson ? JSON.parse(lead.analysisJson) : defaultWebAnalysis(!!lead.website);

        // Generate email
        if (channels.includes("email") && contactEmail) {
          if (isBlacklisted(contactEmail, lead.website ?? undefined, lead.name)) {
            previews.push(`[SKIPPED] ${lead.name}: blacklisted`);
            continue;
          }
          if (isUnsubscribed(contactEmail)) {
            previews.push(`[SKIPPED] ${lead.name}: unsubscribed`);
            continue;
          }

          try {
            const result = await generateEmail(
              lead.name, lead.category, lead.city, lead.website, analysis,
              defaultTone, fromName, customInstructions
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
            logActivity("email_generated", `Email generated via MCP for ${lead.name}`, { leadId: lead.id, campaignId: lead.campaignId ?? undefined });
            previews.push(`[EMAIL] ${lead.name}: "${result.subject}"`);
            emailCount++;
          } catch (e) {
            previews.push(`[ERROR] ${lead.name} email: ${e instanceof Error ? e.message : "unknown"}`);
          }
        }

        // Generate WhatsApp
        if (channels.includes("whatsapp") && lead.phone) {
          try {
            const result = await generateWhatsApp(
              lead.name, lead.category, lead.city, lead.website, analysis,
              defaultTone, fromName, customInstructions
            );

            db.insert(whatsappMessages).values({
              leadId: lead.id,
              campaignId: lead.campaignId,
              toPhone: lead.phone,
              body: result.message,
              tone: defaultTone,
              status: "draft",
            }).run();

            logActivity("wa_generated", `WhatsApp generated via MCP for ${lead.name}`, { leadId: lead.id, campaignId: lead.campaignId ?? undefined });
            previews.push(`[WA] ${lead.name}: "${result.message.slice(0, 80)}..."`);
            waCount++;
          } catch (e) {
            previews.push(`[ERROR] ${lead.name} WA: ${e instanceof Error ? e.message : "unknown"}`);
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
    "Approve and queue messages for sending. When only campaignId is provided, LISTS drafts for review (does NOT auto-approve). When specific IDs are provided, approves those messages.",
    {
      campaignId: z.number().int().optional().describe("Campaign to list drafts from"),
      emailIds: z.array(z.number().int()).optional().describe("Specific email IDs to approve"),
      whatsappIds: z.array(z.number().int()).optional().describe("Specific WhatsApp message IDs to approve"),
    },
    async ({ campaignId, emailIds, whatsappIds }) => {
      // Safety: if only campaignId, list drafts instead of approving
      if (campaignId && !emailIds?.length && !whatsappIds?.length) {
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

        const lines = [`# Drafts for Campaign ID:${campaignId}\n`];

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
          lines.push(`\nTo approve, call approve_and_send with specific emailIds and/or whatsappIds.`);
          lines.push(`Example: approve_and_send(emailIds=[${draftEmails.slice(0, 3).map(e => e.id).join(",")}])`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      // Approve specific IDs
      let approvedEmails = 0;
      let approvedWA = 0;

      if (emailIds?.length) {
        for (const id of emailIds) {
          const email = db.select().from(emails).where(and(eq(emails.id, id), eq(emails.status, "draft"))).get();
          if (email) {
            db.update(emails).set({ status: "approved", updatedAt: new Date().toISOString() }).where(eq(emails.id, id)).run();
            db.update(leads).set({ status: "email_approved" }).where(eq(leads.id, email.leadId)).run();
            db.insert(jobQueue).values({ type: "send_email", leadId: email.leadId, campaignId: email.campaignId }).run();
            logActivity("email_approved", `Email approved via MCP`, { leadId: email.leadId, campaignId: email.campaignId ?? undefined });
            approvedEmails++;
          }
        }
      }

      if (whatsappIds?.length) {
        for (const id of whatsappIds) {
          const msg = db.select().from(whatsappMessages).where(and(eq(whatsappMessages.id, id), eq(whatsappMessages.status, "draft"))).get();
          if (msg) {
            db.update(whatsappMessages).set({ status: "approved", updatedAt: new Date().toISOString() }).where(eq(whatsappMessages.id, id)).run();
            db.insert(jobQueue).values({ type: "send_wa", leadId: msg.leadId, campaignId: msg.campaignId }).run();
            logActivity("wa_approved", `WhatsApp approved via MCP`, { leadId: msg.leadId, campaignId: msg.campaignId ?? undefined });
            approvedWA++;
          }
        }
      }

      // Remaining quota
      const today = new Date().toISOString().split("T")[0];
      const emailSentToday = db.select({ count: sql<number>`count(*)` }).from(emails)
        .where(and(eq(emails.status, "sent"), sql`date(${emails.sentAt}) = ${today}`)).get()?.count ?? 0;
      const effectiveLimit = getEffectiveDailyLimit();

      const lines = [
        `Approved: ${approvedEmails} emails, ${approvedWA} WhatsApp messages.`,
        `Messages queued for the background scheduler.`,
        `\nEmail quota remaining today: ${Math.max(0, effectiveLimit - emailSentToday)} / ${effectiveLimit}`,
      ];

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
