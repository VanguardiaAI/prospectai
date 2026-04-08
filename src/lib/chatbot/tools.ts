import type { ToolDefinition } from "./types";
import * as campaignService from "@/services/campaign.service";
import * as leadService from "@/services/lead.service";
import * as messageService from "@/services/message.service";
import * as analyticsService from "@/services/analytics.service";
import * as settingsService from "@/services/settings.service";
import * as blacklistService from "@/services/blacklist.service";
import * as searchService from "@/services/search.service";

export const chatbotTools: ToolDefinition[] = [
  // ─── Campaigns ─────────────────────────────────────────────────────
  {
    name: "list_campaigns",
    description:
      "List all outreach campaigns with summary metrics (leads, emails sent, open rate, replies).",
    parameters: {
      type: "object",
      properties: {
        status: {
          type: "string",
          description: "Filter by status: active, paused, or archived",
          enum: ["active", "paused", "archived"],
        },
      },
    },
    handler: async (args) => {
      const status = args.status as string | undefined;
      return campaignService.listCampaigns(status ? { status } : undefined);
    },
  },
  {
    name: "create_campaign",
    description: "Create a new outreach campaign.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Campaign name" },
        description: { type: "string", description: "Campaign description" },
        dailyLimit: {
          type: "integer",
          description: "Daily email send limit (default 20)",
        },
        qualityThreshold: {
          type: "integer",
          description:
            "Max web quality score to contact — lower means worse websites get outreach (default 40)",
        },
        autopilot: {
          type: "boolean",
          description: "Auto-approve generated messages",
        },
        defaultTone: {
          type: "string",
          description:
            "Default tone for messages (e.g. professional, casual, friendly)",
        },
      },
      required: ["name"],
    },
    handler: async (args) => {
      return campaignService.createCampaign({
        name: args.name as string,
        description: args.description as string | undefined,
        dailyLimit: args.dailyLimit as number | undefined,
        qualityThreshold: args.qualityThreshold as number | undefined,
        autopilot: args.autopilot as boolean | undefined,
        defaultTone: args.defaultTone as string | undefined,
      });
    },
  },
  {
    name: "update_campaign",
    description: "Update an existing campaign's settings or status.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "integer", description: "Campaign ID to update" },
        name: { type: "string", description: "New campaign name" },
        description: { type: "string", description: "New description" },
        dailyLimit: { type: "integer", description: "New daily email limit" },
        qualityThreshold: {
          type: "integer",
          description: "New quality threshold",
        },
        autopilot: { type: "boolean", description: "Enable/disable autopilot" },
        defaultTone: { type: "string", description: "New default tone" },
        status: {
          type: "string",
          description: "Campaign status",
          enum: ["active", "paused", "archived"],
        },
      },
      required: ["campaignId"],
    },
    handler: async (args) => {
      const { campaignId, ...updates } = args as Record<string, unknown>;
      return campaignService.updateCampaign(
        campaignId as number,
        updates as campaignService.UpdateCampaignInput
      );
    },
  },
  {
    name: "get_campaign_performance",
    description:
      "Get performance metrics for a specific campaign: lead funnel, send/open/click/reply counts, status breakdown.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "integer", description: "Campaign ID" },
      },
      required: ["campaignId"],
    },
    handler: async (args) => {
      return campaignService.getCampaignPerformance(args.campaignId as number);
    },
  },

  // ─── Leads ─────────────────────────────────────────────────────────
  {
    name: "search_leads",
    description:
      "Search and filter leads across campaigns. Returns summarized data.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "integer", description: "Filter by campaign ID" },
        city: { type: "string", description: "Filter by city name" },
        status: {
          type: "string",
          description:
            "Filter by status (imported, analyzed, email_generated, email_sent, etc.)",
        },
        search: { type: "string", description: "Search by name or category" },
        page: { type: "integer", description: "Page number (default 1)" },
        limit: {
          type: "integer",
          description: "Items per page (default 50)",
        },
      },
    },
    handler: async (args) => {
      return leadService.searchLeads(
        args as leadService.SearchLeadsFilters
      );
    },
  },
  {
    name: "get_lead_details",
    description:
      "Get complete details for a single lead including web analysis, recommended services, issues, and message history.",
    parameters: {
      type: "object",
      properties: {
        leadId: { type: "integer", description: "Lead ID" },
      },
      required: ["leadId"],
    },
    handler: async (args) => {
      return leadService.getLeadDetails(args.leadId as number);
    },
  },
  {
    name: "update_lead",
    description:
      "Update a lead's notes, contact email override, status, or campaign assignment.",
    parameters: {
      type: "object",
      properties: {
        leadId: { type: "integer", description: "Lead ID" },
        contactEmail: {
          type: "string",
          description: "Override the contact email",
        },
        notes: { type: "string", description: "Notes to add/update" },
        status: { type: "string", description: "Manually set lead status" },
      },
      required: ["leadId"],
    },
    handler: async (args) => {
      const { leadId, ...updates } = args as Record<string, unknown>;
      return leadService.updateLead(
        leadId as number,
        updates as leadService.UpdateLeadInput
      );
    },
  },

  // ─── Messages ──────────────────────────────────────────────────────
  {
    name: "list_draft_messages",
    description:
      "List email drafts pending review. Returns summary info for quick scanning.",
    parameters: {
      type: "object",
      properties: {
        campaignId: { type: "integer", description: "Filter by campaign" },
        page: { type: "integer", description: "Page number (default 1)" },
        limit: { type: "integer", description: "Items per page (default 20)" },
      },
    },
    handler: async (args) => {
      return messageService.listEmails({
        status: "draft",
        campaignId: args.campaignId as number | undefined,
        page: args.page as number | undefined,
        limit: args.limit as number | undefined,
      });
    },
  },
  {
    name: "approve_messages",
    description:
      "Approve draft email messages for sending. Approved messages are sent by the background scheduler.",
    parameters: {
      type: "object",
      properties: {
        emailIds: {
          type: "array",
          items: { type: "integer" },
          description: "Email IDs to approve",
        },
      },
      required: ["emailIds"],
    },
    handler: async (args) => {
      return messageService.approveEmails(args.emailIds as number[]);
    },
  },

  // ─── Analytics ─────────────────────────────────────────────────────
  {
    name: "get_dashboard",
    description:
      "Get comprehensive dashboard metrics: total leads, sends today, open/click/reply rates, active campaigns, pending jobs, warmup status.",
    parameters: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      return analyticsService.getDashboardMetrics();
    },
  },
  {
    name: "get_recent_activity",
    description:
      "Get recent activity log entries showing what the system has been doing (imports, scrapes, emails, errors, etc.).",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          description:
            "Filter by activity type (import, scrape, email_sent, error, etc.)",
        },
        limit: {
          type: "integer",
          description: "Max entries to return (default 50)",
        },
        page: { type: "integer", description: "Page number (default 1)" },
      },
    },
    handler: async (args) => {
      return analyticsService.getRecentActivity(
        args as analyticsService.RecentActivityOpts
      );
    },
  },

  // ─── Blacklist ─────────────────────────────────────────────────────
  {
    name: "manage_blacklist",
    description:
      "Add, remove, or list blacklisted domains/emails/businesses. Essential for compliance.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description: "Action to perform",
          enum: ["add", "remove", "list"],
        },
        type: {
          type: "string",
          description: "Type of blacklist entry (required for add)",
          enum: ["domain", "email", "business"],
        },
        value: {
          type: "string",
          description:
            "Value to add (e.g. 'spam.com', 'user@spam.com', 'Spam Corp')",
        },
        reason: {
          type: "string",
          description: "Reason for blacklisting (add only)",
        },
        id: {
          type: "integer",
          description: "Blacklist entry ID (required for remove)",
        },
      },
      required: ["action"],
    },
    handler: async (args) => {
      const action = args.action as string;
      if (action === "list") {
        return blacklistService.listBlacklist();
      } else if (action === "add") {
        return blacklistService.addToBlacklist({
          type: args.type as "domain" | "email" | "business",
          value: args.value as string,
          reason: args.reason as string | undefined,
        });
      } else if (action === "remove") {
        return blacklistService.removeFromBlacklist(args.id as number);
      }
      return { error: "Invalid action" };
    },
  },

  // ─── Settings ──────────────────────────────────────────────────────
  {
    name: "check_configuration",
    description:
      "Check system configuration completeness. Reports missing API keys, settings, and integration status.",
    parameters: {
      type: "object",
      properties: {},
    },
    handler: async () => {
      return settingsService.checkConfiguration();
    },
  },
  {
    name: "update_settings",
    description:
      "Update operational settings (agency name, tone, daily limits, etc.). Cannot modify API keys or secrets.",
    parameters: {
      type: "object",
      properties: {
        settings: {
          type: "object",
          description:
            "Key-value pairs to update. Allowed keys include: agency_name, agency_url, agency_description, agency_services, target_country, default_tone, global_daily_limit, wa_daily_limit, from_email, from_name",
        },
      },
      required: ["settings"],
    },
    handler: async (args) => {
      const updates = args.settings as Record<string, string>;
      return settingsService.updateSettings(updates);
    },
  },

  // ─── Search (Google Maps) ──────────────────────────────────────────
  {
    name: "start_search",
    description:
      "Start a Google Maps search for businesses. Results are imported as leads into a campaign.",
    parameters: {
      type: "object",
      properties: {
        keyword: {
          type: "string",
          description:
            "Google Maps search term (e.g. 'restaurantes en Madrid')",
        },
        campaignId: {
          type: "integer",
          description: "Campaign to import leads into",
        },
      },
      required: ["keyword"],
    },
    handler: async (args) => {
      return searchService.startSearch({
        keyword: args.keyword as string,
        campaignId: args.campaignId as number | undefined,
      });
    },
  },

  // ─── Job Processing ────────────────────────────────────────────────
  {
    name: "process_jobs",
    description:
      "Trigger background job processing for scraping, email/WhatsApp generation, and sending. This kicks off the cron pipeline.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          description:
            "Which jobs to process: 'all', 'scrape', 'generate', 'send', 'send_wa', 'sequences'",
          enum: ["all", "scrape", "generate", "send", "send_wa", "sequences"],
        },
      },
    },
    handler: async (args) => {
      const action = (args.action as string) || "all";
      const cronSecret = process.env.CRON_SECRET || "";
      const baseUrl =
        process.env.NEXTAUTH_URL ||
        process.env.NEXT_PUBLIC_BASE_URL ||
        "http://localhost:3000";

      const res = await fetch(
        `${baseUrl}/api/cron?action=${encodeURIComponent(action)}`,
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
  },
];
