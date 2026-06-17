import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db, getSetting, getApiKey } from "@/db";
import { emails, whatsappMessages, leads, jobQueue, campaigns } from "@/db/schema";
import { eq, and, sql, desc } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { formatEmailSummary, formatEmailPreview, formatWASummary, formatWAPreview } from "../helpers/formatters.js";
import { paginationParams } from "../helpers/pagination.js";

export function registerMessageTools(server: McpServer) {
  server.tool(
    "list_draft_messages",
    "List email and WhatsApp message drafts pending review. Returns summary info for quick scanning.",
    {
      channel: z.enum(["email", "whatsapp", "all"]).optional().describe("Filter by channel (default: all)"),
      campaignId: z.number().int().optional().describe("Filter by campaign"),
      page: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
    async ({ channel = "all", campaignId, page, limit }) => {
      const { page: p, limit: l, offset } = paginationParams(page, limit);
      const lines: string[] = [];
      let totalItems = 0;

      if (channel === "email" || channel === "all") {
        const conditions = [eq(emails.status, "draft")];
        if (campaignId) conditions.push(eq(emails.campaignId, campaignId));
        const where = and(...conditions);

        const emailCount = db.select({ count: sql<number>`count(*)` }).from(emails).where(where).get()?.count ?? 0;

        const draftEmails = db.select({
          id: emails.id, subject: emails.subject, bodyText: emails.bodyText,
          toEmail: emails.toEmail, tone: emails.tone, status: emails.status,
          leadId: emails.leadId, createdAt: emails.createdAt,
          bodyHtml: emails.bodyHtml, fromEmail: emails.fromEmail,
        }).from(emails)
          .where(where)
          .orderBy(desc(emails.createdAt))
          .limit(l)
          .offset(offset)
          .all();

        lines.push(`## Email Drafts (${emailCount} total, page ${p})\n`);
        for (const e of draftEmails) {
          const lead = db.select({ name: leads.name }).from(leads).where(eq(leads.id, e.leadId)).get();
          lines.push(formatEmailSummary(e, lead?.name ?? "Unknown"));
        }
        if (offset + l < emailCount) lines.push(`... more email drafts. Use page=${p + 1}`);
        totalItems += emailCount;
      }

      if (channel === "whatsapp" || channel === "all") {
        const conditions = [eq(whatsappMessages.status, "draft")];
        if (campaignId) conditions.push(eq(whatsappMessages.campaignId, campaignId));
        const where = and(...conditions);

        const waCount = db.select({ count: sql<number>`count(*)` }).from(whatsappMessages).where(where).get()?.count ?? 0;

        const draftWA = db.select({
          id: whatsappMessages.id, body: whatsappMessages.body,
          toPhone: whatsappMessages.toPhone, tone: whatsappMessages.tone,
          status: whatsappMessages.status, leadId: whatsappMessages.leadId,
          createdAt: whatsappMessages.createdAt,
        }).from(whatsappMessages)
          .where(where)
          .orderBy(desc(whatsappMessages.createdAt))
          .limit(l)
          .offset(offset)
          .all();

        lines.push(`\n## WhatsApp Drafts (${waCount} total, page ${p})\n`);
        for (const w of draftWA) {
          const lead = db.select({ name: leads.name }).from(leads).where(eq(leads.id, w.leadId)).get();
          lines.push(formatWASummary(w, lead?.name ?? "Unknown"));
        }
        if (offset + l < waCount) lines.push(`... more WA drafts. Use page=${p + 1}`);
        totalItems += waCount;
      }

      if (totalItems === 0) lines.push("No drafts pending review.");
      lines.push(`\nUse get_message_preview to see full content before approving.`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  server.tool(
    "get_message_preview",
    "Get the full content of a specific email or WhatsApp message for review before approval.",
    {
      messageId: z.number().int().describe("Message ID"),
      channel: z.enum(["email", "whatsapp"]).describe("Message channel"),
    },
    async ({ messageId, channel }) => {
      if (channel === "email") {
        const email = db.select().from(emails).where(eq(emails.id, messageId)).get();
        if (!email) return { content: [{ type: "text", text: `Email ID ${messageId} not found.` }], isError: true };
        const lead = db.select({ name: leads.name }).from(leads).where(eq(leads.id, email.leadId)).get();
        return { content: [{ type: "text", text: formatEmailPreview(email, lead?.name ?? "Unknown") }] };
      } else {
        const msg = db.select().from(whatsappMessages).where(eq(whatsappMessages.id, messageId)).get();
        if (!msg) return { content: [{ type: "text", text: `WhatsApp message ID ${messageId} not found.` }], isError: true };
        const lead = db.select({ name: leads.name }).from(leads).where(eq(leads.id, msg.leadId)).get();
        return { content: [{ type: "text", text: formatWAPreview(msg, lead?.name ?? "Unknown") }] };
      }
    }
  );

  server.tool(
    "edit_message",
    "Edit a draft email or WhatsApp message before approval. Only works on messages with 'draft' status.",
    {
      messageId: z.number().int().describe("Message ID"),
      channel: z.enum(["email", "whatsapp"]).describe("Message channel"),
      subject: z.string().optional().describe("New subject (email only)"),
      bodyText: z.string().optional().describe("New plain text body (email only)"),
      bodyHtml: z.string().optional().describe("New HTML body (email only)"),
      body: z.string().optional().describe("New message body (WhatsApp only)"),
    },
    async ({ messageId, channel, subject, bodyText, bodyHtml, body }) => {
      if (channel === "email") {
        const email = db.select().from(emails).where(eq(emails.id, messageId)).get();
        if (!email) return { content: [{ type: "text", text: `Email ID ${messageId} not found.` }], isError: true };
        if (email.status !== "draft") return { content: [{ type: "text", text: `Email is not a draft (status: ${email.status}).` }], isError: true };

        const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };
        if (subject) updates.subject = subject;
        if (bodyText) updates.bodyText = bodyText;
        if (bodyHtml) updates.bodyHtml = bodyHtml;

        db.update(emails).set(updates).where(eq(emails.id, messageId)).run();
        return { content: [{ type: "text", text: `Email [ID:${messageId}] updated.` }] };
      } else {
        const msg = db.select().from(whatsappMessages).where(eq(whatsappMessages.id, messageId)).get();
        if (!msg) return { content: [{ type: "text", text: `WhatsApp message ID ${messageId} not found.` }], isError: true };
        if (msg.status !== "draft") return { content: [{ type: "text", text: `Message is not a draft (status: ${msg.status}).` }], isError: true };

        if (body) {
          db.update(whatsappMessages).set({ body, updatedAt: new Date().toISOString() }).where(eq(whatsappMessages.id, messageId)).run();
        }
        return { content: [{ type: "text", text: `WhatsApp message [ID:${messageId}] updated.` }] };
      }
    }
  );

  server.tool(
    "approve_messages",
    "Approve draft messages for sending. Approved messages are sent by the background scheduler respecting warmup and send window limits.",
    {
      emailIds: z.array(z.number().int()).optional().describe("Email IDs to approve"),
      whatsappIds: z.array(z.number().int()).optional().describe("WhatsApp message IDs to approve"),
      campaignId: z.number().int().optional().describe("Approve ALL drafts for this campaign (use with care)"),
    },
    async ({ emailIds, whatsappIds, campaignId }) => {
      let approvedEmails = 0;
      let approvedWA = 0;
      let bulkWarning = "";

      // Bulk approve by campaign (with safety limit of 50)
      if (campaignId && !emailIds?.length && !whatsappIds?.length) {
        const MAX_BULK_APPROVE = 50;

        const draftEmails = db.select({ id: emails.id, leadId: emails.leadId, campaignId: emails.campaignId })
          .from(emails)
          .where(and(eq(emails.campaignId, campaignId), eq(emails.status, "draft")))
          .limit(MAX_BULK_APPROVE)
          .all();
        const draftWA = db.select({ id: whatsappMessages.id, leadId: whatsappMessages.leadId, campaignId: whatsappMessages.campaignId })
          .from(whatsappMessages)
          .where(and(eq(whatsappMessages.campaignId, campaignId), eq(whatsappMessages.status, "draft")))
          .limit(MAX_BULK_APPROVE)
          .all();

        // Count total to warn if there are more
        const totalDraftEmails = db.select({ count: sql<number>`count(*)` }).from(emails)
          .where(and(eq(emails.campaignId, campaignId), eq(emails.status, "draft"))).get()?.count ?? 0;
        const totalDraftWA = db.select({ count: sql<number>`count(*)` }).from(whatsappMessages)
          .where(and(eq(whatsappMessages.campaignId, campaignId), eq(whatsappMessages.status, "draft"))).get()?.count ?? 0;

        emailIds = draftEmails.map(e => e.id);
        whatsappIds = draftWA.map(w => w.id);

        if (emailIds.length === 0 && whatsappIds.length === 0) {
          return { content: [{ type: "text", text: `No drafts found for campaign ID ${campaignId}.` }] };
        }

        const remaining = (totalDraftEmails - draftEmails.length) + (totalDraftWA - draftWA.length);
        if (remaining > 0) {
          bulkWarning = `\nNote: ${remaining} more drafts remain. Run approve_messages(campaignId=${campaignId}) again to approve the next batch.`;
        }
      }

      if (emailIds?.length) {
        for (const id of emailIds) {
          const email = db.select().from(emails).where(and(eq(emails.id, id), eq(emails.status, "draft"))).get();
          if (email) {
            db.update(emails).set({ status: "approved", updatedAt: new Date().toISOString() }).where(eq(emails.id, id)).run();
            db.update(leads).set({ status: "email_approved" }).where(eq(leads.id, email.leadId)).run();
            db.insert(jobQueue).values({ type: "send_email", leadId: email.leadId, campaignId: email.campaignId }).run();
            logActivity("email_approved", `Email approved via MCP for lead ID ${email.leadId}`, { leadId: email.leadId, campaignId: email.campaignId ?? undefined, messageKey: "activityLog.emailApprovedForLead", messageVars: { id: email.leadId } });
            approvedEmails++;
          }
        }
      }

      if (whatsappIds?.length) {
        for (const id of whatsappIds) {
          const msg = db.select().from(whatsappMessages).where(and(eq(whatsappMessages.id, id), eq(whatsappMessages.status, "draft"))).get();
          if (msg) {
            db.update(whatsappMessages).set({ status: "approved", updatedAt: new Date().toISOString() }).where(eq(whatsappMessages.id, id)).run();
            db.update(leads).set({ status: "wa_approved" }).where(eq(leads.id, msg.leadId)).run();
            db.insert(jobQueue).values({ type: "send_wa", leadId: msg.leadId, campaignId: msg.campaignId }).run();
            logActivity("wa_approved", `WhatsApp approved via MCP for lead ID ${msg.leadId}`, { leadId: msg.leadId, campaignId: msg.campaignId ?? undefined, messageKey: "activityLog.waApproved" });
            approvedWA++;
          }
        }
      }

      if (approvedEmails === 0 && approvedWA === 0) {
        return { content: [{ type: "text", text: "No messages were approved. Check that the IDs are valid draft messages." }] };
      }

      let msg = `Approved: ${approvedEmails} emails, ${approvedWA} WhatsApp messages.\nMessages are queued for sending by the background scheduler.`;
      if (bulkWarning) msg += bulkWarning;

      return { content: [{ type: "text", text: msg }] };
    }
  );

  server.tool(
    "reject_messages",
    "Reject draft messages. Rejected messages will not be sent. Optionally provide a reason for the rejection.",
    {
      emailIds: z.array(z.number().int()).optional().describe("Email IDs to reject"),
      whatsappIds: z.array(z.number().int()).optional().describe("WhatsApp message IDs to reject"),
      reason: z.string().optional().describe("Reason for rejection"),
    },
    async ({ emailIds, whatsappIds, reason }) => {
      let rejectedEmails = 0;
      let rejectedWA = 0;

      if (emailIds?.length) {
        for (const id of emailIds) {
          const email = db.select().from(emails).where(and(eq(emails.id, id), eq(emails.status, "draft"))).get();
          if (email) {
            db.update(emails).set({ status: "rejected", updatedAt: new Date().toISOString() }).where(eq(emails.id, id)).run();
            logActivity("email_rejected", `Email rejected via MCP${reason ? `: ${reason}` : ""}`, { leadId: email.leadId, campaignId: email.campaignId ?? undefined, messageKey: "activityLog.emailRejected" });
            rejectedEmails++;
          }
        }
      }

      if (whatsappIds?.length) {
        for (const id of whatsappIds) {
          const msg = db.select().from(whatsappMessages).where(and(eq(whatsappMessages.id, id), eq(whatsappMessages.status, "draft"))).get();
          if (msg) {
            db.update(whatsappMessages).set({ status: "rejected", updatedAt: new Date().toISOString() }).where(eq(whatsappMessages.id, id)).run();
            logActivity("wa_rejected", `WhatsApp rejected via MCP${reason ? `: ${reason}` : ""}`, { leadId: msg.leadId, campaignId: msg.campaignId ?? undefined, messageKey: "activityLog.waRejected" });
            rejectedWA++;
          }
        }
      }

      if (rejectedEmails === 0 && rejectedWA === 0) {
        return { content: [{ type: "text", text: "No messages were rejected. Check that the IDs are valid draft messages." }] };
      }

      return {
        content: [{
          type: "text",
          text: `Rejected: ${rejectedEmails} emails, ${rejectedWA} WhatsApp messages.${reason ? `\nReason: ${reason}` : ""}`,
        }],
      };
    }
  );

  server.tool(
    "regenerate_message",
    "Regenerate a draft message with a different tone or custom instructions. Replaces the current draft content.",
    {
      messageId: z.number().int().describe("Message ID to regenerate"),
      channel: z.enum(["email", "whatsapp"]).describe("Message channel"),
      tone: z.string().optional().describe("New tone (professional, casual, urgent, friendly, etc.)"),
      instructions: z.string().optional().describe("Custom instructions for the AI"),
    },
    async ({ messageId, channel, tone, instructions }) => {
      if (!getApiKey("gemini_api_key", "GEMINI_API_KEY")) {
        return { content: [{ type: "text", text: "Cannot regenerate: GEMINI_API_KEY not configured." }], isError: true };
      }

      if (channel === "email") {
        const email = db.select().from(emails).where(eq(emails.id, messageId)).get();
        if (!email) return { content: [{ type: "text", text: `Email ID ${messageId} not found.` }], isError: true };
        if (email.status !== "draft") return { content: [{ type: "text", text: `Email is not a draft (status: ${email.status}).` }], isError: true };

        const lead = db.select().from(leads).where(eq(leads.id, email.leadId)).get();
        if (!lead) return { content: [{ type: "text", text: `Lead not found for this email.` }], isError: true };

        const { regenerateEmail, defaultWebAnalysis } = await import("@/lib/gemini");
        const fromName = getSetting("from_name") || getSetting("agency_name") || "ProspectAI";
        const emailCampaign = email.campaignId ? db.select().from(campaigns).where(eq(campaigns.id, email.campaignId)).get() : null;
        const result = await regenerateEmail(
          lead.name, lead.category, lead.city, lead.website,
          lead.analysisJson ? JSON.parse(lead.analysisJson) : defaultWebAnalysis(lead.website, lead.webQualityScore ?? 0, lead.analysisSummary ?? ""),
          tone || email.tone, fromName,
          email.subject, email.bodyText,
          instructions || "",
          undefined, emailCampaign?.agencyProfileId ?? undefined
        );

        db.update(emails).set({
          subject: result.subject,
          bodyHtml: result.bodyHtml,
          bodyText: result.bodyText,
          tone: tone || email.tone,
          updatedAt: new Date().toISOString(),
        }).where(eq(emails.id, messageId)).run();

        return { content: [{ type: "text", text: formatEmailPreview({ ...email, subject: result.subject, bodyText: result.bodyText, bodyHtml: result.bodyHtml, tone: tone || email.tone }, lead.name) }] };
      } else {
        const msg = db.select().from(whatsappMessages).where(eq(whatsappMessages.id, messageId)).get();
        if (!msg) return { content: [{ type: "text", text: `WhatsApp message ID ${messageId} not found.` }], isError: true };
        if (msg.status !== "draft") return { content: [{ type: "text", text: `Message is not a draft.` }], isError: true };

        const lead = db.select().from(leads).where(eq(leads.id, msg.leadId)).get();
        if (!lead) return { content: [{ type: "text", text: `Lead not found.` }], isError: true };

        const { regenerateWhatsApp, defaultWebAnalysis } = await import("@/lib/gemini");
        const waFromName = getSetting("from_name") || getSetting("agency_name") || "ProspectAI";
        const waCampaign = msg.campaignId ? db.select().from(campaigns).where(eq(campaigns.id, msg.campaignId)).get() : null;
        const result = await regenerateWhatsApp(
          lead.name, lead.category, lead.city, lead.website,
          lead.analysisJson ? JSON.parse(lead.analysisJson) : defaultWebAnalysis(lead.website, lead.webQualityScore ?? 0, lead.analysisSummary ?? ""),
          tone || msg.tone, waFromName,
          msg.body,
          instructions || "",
          undefined, waCampaign?.agencyProfileId ?? undefined
        );

        db.update(whatsappMessages).set({
          body: result.message,
          tone: tone || msg.tone,
          updatedAt: new Date().toISOString(),
        }).where(eq(whatsappMessages.id, messageId)).run();

        return { content: [{ type: "text", text: formatWAPreview({ ...msg, body: result.message, tone: tone || msg.tone }, lead.name) }] };
      }
    }
  );
}
