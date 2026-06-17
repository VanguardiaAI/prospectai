import { tool, zodSchema } from "ai";
import { z } from "zod";
import * as campaignService from "@/services/campaign.service";
import * as leadService from "@/services/lead.service";
import * as messageService from "@/services/message.service";
import * as analyticsService from "@/services/analytics.service";
import * as settingsService from "@/services/settings.service";
import * as blacklistService from "@/services/blacklist.service";
import * as searchService from "@/services/search.service";
import * as agencyProfileService from "@/services/agency-profile.service";
import { isSafeSetting, SAFE_SETTINGS_KEYS } from "@/mcp/helpers/validators";

/* eslint-disable @typescript-eslint/no-explicit-any */

// Single source of truth per tool: description + raw Zod object schema + execute.
// Two shapes are derived from these defs (see exports at the bottom of the file):
//   - `chatbotTools`    → AI SDK tools (zodSchema wrapper for Zod v4 compat), executed
//                         in-process by streamText for the anthropic/gemini providers.
//   - `chatbotCliTools` → raw-Zod tools for the claude_cli bridge. createAiSdkMcpServer
//                         requires a Zod object schema and rejects zodSchema()/jsonSchema().
interface ToolDef<T extends z.ZodObject<any>> {
  description: string;
  parameters: T;
  execute: (args: z.infer<T>) => Promise<unknown>;
}

function zTool<T extends z.ZodObject<any>>(opts: ToolDef<T>): ToolDef<T> {
  return opts;
}

const toolDefs = {
  // ─── Campaigns ─────────────────────────────────────────────────────
  list_campaigns: zTool({
    description:
      "List all outreach campaigns with summary metrics (leads, emails sent, open rate, replies).",
    parameters: z.object({
      status: z
        .enum(["active", "paused", "archived"])
        .optional()
        .describe("Filter by status: active, paused, or archived"),
    }),
    execute: async ({ status }) => {
      return campaignService.listCampaigns(status ? { status } : undefined);
    },
  }),

  create_campaign: zTool({
    description: "Create a new outreach campaign.",
    parameters: z.object({
      name: z.string().describe("Campaign name"),
      description: z.string().optional().describe("Campaign description"),
      dailyLimit: z
        .number()
        .int()
        .optional()
        .describe("Daily email send limit (default 20)"),
      qualityThreshold: z
        .number()
        .int()
        .optional()
        .describe(
          "Max web quality score to contact — lower means worse websites get outreach (default 40)"
        ),
      autopilot: z
        .boolean()
        .optional()
        .describe("Auto-approve generated messages"),
      defaultTone: z
        .string()
        .optional()
        .describe(
          "Default tone for messages (e.g. professional, casual, friendly)"
        ),
      channels: z
        .array(z.enum(["email", "whatsapp"]))
        .optional()
        .describe(
          "Outreach channels this campaign uses: ['email'], ['whatsapp'], or both. Defaults to ['email']. A service-config warning only fires for channels that at least one campaign uses."
        ),
    }),
    execute: async (args) => {
      return campaignService.createCampaign(args);
    },
  }),

  update_campaign: zTool({
    description: "Update an existing campaign's settings or status.",
    parameters: z.object({
      campaignId: z.number().int().describe("Campaign ID to update"),
      name: z.string().optional().describe("New campaign name"),
      description: z.string().optional().describe("New description"),
      dailyLimit: z
        .number()
        .int()
        .optional()
        .describe("New daily email limit"),
      qualityThreshold: z
        .number()
        .int()
        .optional()
        .describe("New quality threshold"),
      autopilot: z
        .boolean()
        .optional()
        .describe("Enable/disable autopilot"),
      defaultTone: z.string().optional().describe("New default tone"),
      channels: z
        .array(z.enum(["email", "whatsapp"]))
        .optional()
        .describe("Outreach channels: ['email'], ['whatsapp'], or both"),
      status: z
        .enum(["active", "paused", "archived"])
        .optional()
        .describe("Campaign status"),
    }),
    execute: async ({ campaignId, ...updates }) => {
      return campaignService.updateCampaign(campaignId, updates);
    },
  }),

  get_campaign_performance: zTool({
    description:
      "Get performance metrics for a specific campaign: lead funnel, send/open/click/reply counts, status breakdown.",
    parameters: z.object({
      campaignId: z.number().int().describe("Campaign ID"),
    }),
    execute: async ({ campaignId }) => {
      return campaignService.getCampaignPerformance(campaignId);
    },
  }),

  // ─── Leads ─────────────────────────────────────────────────────────
  search_leads: zTool({
    description:
      "Search and filter leads across campaigns. Returns summarized data.",
    parameters: z.object({
      campaignId: z.number().int().optional().describe("Filter by campaign ID"),
      city: z.string().optional().describe("Filter by city name"),
      status: z
        .string()
        .optional()
        .describe(
          "Filter by status (imported, analyzed, email_generated, email_sent, etc.)"
        ),
      search: z.string().optional().describe("Search by name or category"),
      page: z.number().int().optional().describe("Page number (default 1)"),
      limit: z
        .number()
        .int()
        .optional()
        .describe("Items per page (default 50)"),
    }),
    execute: async (args) => {
      return leadService.searchLeads(args as leadService.SearchLeadsFilters);
    },
  }),

  get_lead_details: zTool({
    description:
      "Get complete details for a single lead including web analysis, recommended services, issues, and message history.",
    parameters: z.object({
      leadId: z.number().int().describe("Lead ID"),
    }),
    execute: async ({ leadId }) => {
      return leadService.getLeadDetails(leadId);
    },
  }),

  update_lead: zTool({
    description:
      "Update a lead's notes, contact email override, status, or campaign assignment.",
    parameters: z.object({
      leadId: z.number().int().describe("Lead ID"),
      contactEmail: z
        .string()
        .optional()
        .describe("Override the contact email"),
      notes: z.string().optional().describe("Notes to add/update"),
      status: z.string().optional().describe("Manually set lead status"),
    }),
    execute: async ({ leadId, ...updates }) => {
      return leadService.updateLead(
        leadId,
        updates as leadService.UpdateLeadInput
      );
    },
  }),

  // ─── Messages ──────────────────────────────────────────────────────
  list_draft_messages: zTool({
    description:
      "List email drafts pending review. Returns summary info for quick scanning.",
    parameters: z.object({
      campaignId: z.number().int().optional().describe("Filter by campaign"),
      page: z.number().int().optional().describe("Page number (default 1)"),
      limit: z
        .number()
        .int()
        .optional()
        .describe("Items per page (default 20)"),
    }),
    execute: async (args) => {
      return messageService.listEmails({
        status: "draft",
        campaignId: args.campaignId,
        page: args.page,
        limit: args.limit,
      });
    },
  }),

  list_whatsapp_drafts: zTool({
    description:
      "List WhatsApp message drafts pending review (with lead context).",
    parameters: z.object({
      limit: z.number().int().optional().describe("Max drafts to return (default 100)"),
    }),
    execute: async ({ limit }) => {
      return messageService.listWhatsAppMessages({ status: "draft", limit });
    },
  }),

  approve_messages: zTool({
    description:
      "Approve draft messages for sending. Pass emailIds and/or whatsappIds. Approved emails are sent by the background scheduler; approved WhatsApp messages are sent from Review.",
    parameters: z.object({
      emailIds: z.array(z.number().int()).optional().describe("Email draft IDs to approve"),
      whatsappIds: z.array(z.number().int()).optional().describe("WhatsApp draft IDs to approve"),
    }),
    execute: async ({ emailIds, whatsappIds }) => {
      if (!emailIds?.length && !whatsappIds?.length) {
        return { error: "Provide emailIds and/or whatsappIds." };
      }
      const result: Record<string, unknown> = {};
      if (emailIds?.length) result.emails = messageService.approveEmails(emailIds);
      if (whatsappIds?.length) result.whatsapp = messageService.approveWhatsApp(whatsappIds);
      return result;
    },
  }),

  reject_messages: zTool({
    description:
      "Reject draft messages (email and/or WhatsApp) so they are never sent.",
    parameters: z.object({
      emailIds: z.array(z.number().int()).optional().describe("Email draft IDs to reject"),
      whatsappIds: z.array(z.number().int()).optional().describe("WhatsApp draft IDs to reject"),
    }),
    execute: async ({ emailIds, whatsappIds }) => {
      let rejected = 0;
      for (const id of emailIds ?? []) { messageService.updateEmail(id, { status: "rejected" }); rejected++; }
      for (const id of whatsappIds ?? []) { messageService.updateWhatsApp(id, { status: "rejected" }); rejected++; }
      return { rejected };
    },
  }),

  edit_message: zTool({
    description:
      "Edit a draft message's content before approving. For email pass subject and/or body; for WhatsApp pass body. Keeps the message in draft.",
    parameters: z.object({
      channel: z.enum(["email", "whatsapp"]).describe("Which message store"),
      id: z.number().int().describe("Message ID"),
      subject: z.string().optional().describe("New subject (email only)"),
      body: z.string().optional().describe("New message body / text"),
    }),
    execute: async ({ channel, id, subject, body }) => {
      if (channel === "email") {
        const updates: { subject?: string; bodyHtml?: string; bodyText?: string } = {};
        if (subject !== undefined) updates.subject = subject;
        if (body !== undefined) {
          updates.bodyText = body;
          updates.bodyHtml = `<p>${body.replace(/\n/g, "</p><p>")}</p>`;
        }
        return messageService.updateEmail(id, updates);
      }
      return messageService.updateWhatsApp(id, { body });
    },
  }),

  // ─── Analytics ─────────────────────────────────────────────────────
  get_replies: zTool({
    description:
      "Read inbound replies (email + WhatsApp) with AI-classified intent (interested / question / not_interested / auto_reply / unsubscribe / other). Filter by campaign, status (unread/handled) or channel.",
    parameters: z.object({
      campaignId: z.number().int().optional().describe("Filter by campaign"),
      status: z.enum(["unread", "handled"]).optional().describe("Triage status"),
      channel: z.enum(["email", "whatsapp"]).optional().describe("Reply channel"),
      limit: z.number().int().optional().describe("Max replies (default 30)"),
    }),
    execute: async (args) => {
      return analyticsService.getReplies(args);
    },
  }),

  get_sending_quota: zTool({
    description:
      "Today's sending snapshot: emails/WhatsApp sent today, effective daily limit (with warmup), drafts ready to send, active sequences and pending jobs.",
    parameters: z.object({}),
    execute: async () => {
      return analyticsService.getTodayMetrics();
    },
  }),
  get_dashboard: zTool({
    description:
      "Get comprehensive dashboard metrics: total leads, sends today, open/click/reply rates, active campaigns, pending jobs, warmup status.",
    parameters: z.object({}),
    execute: async () => {
      return analyticsService.getDashboardMetrics();
    },
  }),

  get_recent_activity: zTool({
    description:
      "Get recent activity log entries showing what the system has been doing (imports, scrapes, emails, errors, etc.).",
    parameters: z.object({
      type: z
        .string()
        .optional()
        .describe(
          "Filter by activity type (import, scrape, email_sent, error, etc.)"
        ),
      limit: z
        .number()
        .int()
        .optional()
        .describe("Max entries to return (default 50)"),
      page: z.number().int().optional().describe("Page number (default 1)"),
    }),
    execute: async (args) => {
      return analyticsService.getRecentActivity(
        args as analyticsService.RecentActivityOpts
      );
    },
  }),

  // ─── Blacklist ─────────────────────────────────────────────────────
  manage_blacklist: zTool({
    description:
      "Add, remove, or list blacklisted domains/emails/businesses. Essential for compliance.",
    parameters: z.object({
      action: z
        .enum(["add", "remove", "list"])
        .describe("Action to perform"),
      type: z
        .enum(["domain", "email", "business"])
        .optional()
        .describe("Type of blacklist entry (required for add)"),
      value: z
        .string()
        .optional()
        .describe(
          "Value to add (e.g. 'spam.com', 'user@spam.com', 'Spam Corp')"
        ),
      reason: z
        .string()
        .optional()
        .describe("Reason for blacklisting (add only)"),
      id: z
        .number()
        .int()
        .optional()
        .describe("Blacklist entry ID (required for remove)"),
    }),
    execute: async (args) => {
      if (args.action === "list") {
        return blacklistService.listBlacklist();
      } else if (args.action === "add") {
        return blacklistService.addToBlacklist({
          type: args.type as "domain" | "email" | "business",
          value: args.value as string,
          reason: args.reason,
        });
      } else if (args.action === "remove") {
        return blacklistService.removeFromBlacklist(args.id as number);
      }
      return { error: "Invalid action" };
    },
  }),

  // ─── Agency Profile ────────────────────────────────────────────────
  get_profile: zTool({
    description:
      "Get the agency/sender profile (identity, services, contact) and whether onboarding is complete. The profile must exist before creating campaigns.",
    parameters: z.object({}),
    execute: async () => {
      return {
        profile: agencyProfileService.getAgencyProfile(),
        onboardingComplete: agencyProfileService.isOnboardingComplete(),
      };
    },
  }),

  update_profile: zTool({
    description:
      "Create or update the agency/sender profile used as the identity for all outreach. Set completeOnboarding=true once the essentials (at least name) are filled so campaigns can be created. Does NOT set secrets/API keys.",
    parameters: z.object({
      name: z.string().optional().describe("Agency/business name"),
      url: z.string().optional().describe("Website URL"),
      description: z.string().optional().describe("What the agency does"),
      tagline: z.string().optional().describe("Short tagline"),
      ownerName: z.string().optional().describe("Sender's name (used as from_name)"),
      ownerRole: z.string().optional().describe("Sender's role/title"),
      contactEmail: z
        .string()
        .optional()
        .describe("Contact email (mirrors to from_email when unset)"),
      contactPhone: z.string().optional().describe("Contact phone"),
      services: z
        .array(z.string())
        .optional()
        .describe("List of offered services"),
      city: z.string().optional().describe("City"),
      country: z.string().optional().describe("Country"),
      valueProps: z
        .array(z.string())
        .optional()
        .describe("Key value propositions / differentiators"),
      completeOnboarding: z
        .boolean()
        .optional()
        .describe("Mark onboarding complete (unlocks campaign creation)"),
    }),
    execute: async ({ completeOnboarding, ...data }) => {
      const profile = agencyProfileService.upsertAgencyProfile({
        ...data,
        source: "manual",
      });
      if (completeOnboarding) {
        return {
          profile: agencyProfileService.markOnboardingComplete("manual"),
          onboardingComplete: true,
        };
      }
      return {
        profile,
        onboardingComplete: agencyProfileService.isOnboardingComplete(),
      };
    },
  }),

  // ─── Settings ──────────────────────────────────────────────────────
  check_configuration: zTool({
    description:
      "Check system configuration completeness. Reports missing API keys, settings, and integration status.",
    parameters: z.object({}),
    execute: async () => {
      return settingsService.checkConfiguration();
    },
  }),

  update_settings: zTool({
    description:
      "Update operational settings (agency name, tone, daily limits, etc.). API keys, passwords and any secret/auth key are BLOCKED and silently dropped — tell the user to open Settings for those.",
    parameters: z.object({
      settings: z
        .record(z.string(), z.string())
        .describe(
          `Key-value pairs to update. Only these keys are allowed; anything else is rejected: ${SAFE_SETTINGS_KEYS.join(", ")}`
        ),
    }),
    execute: async ({ settings }) => {
      // Security boundary: the chat agent must never write secrets (API keys,
      // SMTP/IMAP passwords, etc.). Mirror the MCP server's allowlist so the two
      // agent surfaces behave identically.
      const allowed: Record<string, string> = {};
      const blocked: string[] = [];
      for (const [key, value] of Object.entries(settings)) {
        if (isSafeSetting(key)) allowed[key] = value;
        else blocked.push(key);
      }
      if (Object.keys(allowed).length === 0) {
        return {
          updated: [],
          blocked,
          message: blocked.length
            ? `Nothing updated. These keys can't be changed from chat (secrets/API keys or unknown): ${blocked.join(", ")}. Ask the user to open Settings.`
            : "No settings provided.",
        };
      }
      settingsService.updateSettings(allowed);
      return {
        updated: Object.keys(allowed),
        blocked,
        ...(blocked.length
          ? { note: `Ignored protected/unknown keys: ${blocked.join(", ")}` }
          : {}),
      };
    },
  }),

  // ─── Search (Google Maps) ──────────────────────────────────────────
  start_search: zTool({
    description:
      "Start a Google Maps search for businesses. Results are imported as leads into a campaign.",
    parameters: z.object({
      keyword: z
        .string()
        .describe(
          "Google Maps search term (e.g. 'restaurantes en Madrid')"
        ),
      campaignId: z
        .number()
        .int()
        .optional()
        .describe("Campaign to import leads into"),
    }),
    execute: async (args) => {
      return searchService.startSearch(args);
    },
  }),

  // ─── Job Processing ────────────────────────────────────────────────
  process_jobs: zTool({
    description:
      "Trigger background job processing for scraping, email/WhatsApp generation, and sending. This kicks off the cron pipeline.",
    parameters: z.object({
      action: z
        .enum(["all", "scrape", "generate", "send", "send_wa", "sequences"])
        .optional()
        .describe(
          "Which jobs to process: 'all', 'scrape', 'generate', 'send', 'send_wa', 'sequences'"
        ),
    }),
    execute: async ({ action }) => {
      const jobAction = action || "all";
      const cronSecret = process.env.CRON_SECRET || "";
      const baseUrl =
        process.env.NEXTAUTH_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        "http://localhost:3000";

      const res = await fetch(
        `${baseUrl}/api/cron?action=${encodeURIComponent(jobAction)}`,
        {
          method: "POST",
          headers: {
            "x-cron-secret": cronSecret,
            "Content-Type": "application/json",
          },
        }
      );

      if (!res.ok) {
        const text = await res.text();
        return { error: `Cron trigger failed (${res.status}): ${text}` };
      }

      return res.json();
    },
  }),
};

// ─── Derived tool maps ───────────────────────────────────────────────

// AI SDK tools for the anthropic / gemini providers (executed in-process by streamText).
export const chatbotTools = Object.fromEntries(
  Object.entries(toolDefs).map(([name, d]) => [
    name,
    tool({
      description: d.description,
      inputSchema: zodSchema(d.parameters as any) as any,
      execute: d.execute as any,
    }),
  ])
) as Record<string, ReturnType<typeof tool>>;

// Raw-Zod tools for the claude_cli bridge — createAiSdkMcpServer requires a Zod
// object schema (it rejects zodSchema()/jsonSchema()-wrapped inputs).
export const chatbotCliTools = Object.fromEntries(
  Object.entries(toolDefs).map(([name, d]) => [
    name,
    { description: d.description, inputSchema: d.parameters, execute: d.execute },
  ])
) as Record<
  string,
  { description: string; inputSchema: z.ZodObject<any>; execute: (args: any) => Promise<unknown> }
>;

// MCP server name and the fully-qualified tool names the CLI exposes:
// mcp__<serverName>__<toolName>.
export const CLI_MCP_SERVER_NAME = "prospectai";
export const cliToolNames = Object.keys(toolDefs).map(
  (n) => `mcp__${CLI_MCP_SERVER_NAME}__${n}`
);
