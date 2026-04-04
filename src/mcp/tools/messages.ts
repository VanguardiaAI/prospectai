import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db } from "@/db";
import { emails, whatsappMessages, leads, jobQueue } from "@/db/schema";
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

        const draftEmails = db.select({
          id: emails.id, subject: emails.subject, bodyText: emails.bodyText,
          toEmail: emails.toEmail, tone: emails.tone, status: emails.status,
          leadId: emails.leadId, createdAt: emails.createdAt,
          bodyHtml: emails.bodyHtml, fromEmail: emails.fromEmail,
        }).from(emails)
          .where(and(...conditions))
          .orderBy(desc(emails.createdAt))
          .all();

        lines.push(`## Email Drafts (${draftEmails.length})\n`);
        const sliced = draftEmails.slice(offset, offset + l);
        for (const e of sliced) {
          const lead = db.select({ name: leads.name }).from(leads).where(eq(leads.id, e.leadId)).get();
          lines.push(formatEmailSummary(e, lead?.name ?? "Unknown"));
        }
        totalItems += draftEmails.length;
      }

      if (channel === "whatsapp" || channel === "all") {
        const conditions = [eq(whatsappMessages.status, "draft")];
        if (campaignId) conditions.push(eq(whatsappMessages.campaignId, campaignId));

        const draftWA = db.select({
          id: whatsappMessages.id, body: whatsappMessages.body,
          toPhone: whatsappMessages.toPhone, tone: whatsappMessages.tone,
          status: whatsappMessages.status, leadId: whatsappMessages.leadId,
          createdAt: whatsappMessages.createdAt,
        }).from(whatsappMessages)
          .where(and(...conditions))
          .orderBy(desc(whatsappMessages.createdAt))
          .all();

        lines.push(`\n## WhatsApp Drafts (${draftWA.length})\n`);
        const sliced = draftWA.slice(offset, offset + l);
        for (const w of sliced) {
          const lead = db.select({ name: leads.name }).from(leads).where(eq(leads.id, w.leadId)).get();
          lines.push(formatWASummary(w, lead?.name ?? "Unknown"));
        }
        totalItems += draftWA.length;
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
    },
    async ({ emailIds, whatsappIds }) => {
      let approvedEmails = 0;
      let approvedWA = 0;

      if (emailIds?.length) {
        for (const id of emailIds) {
          const email = db.select().from(emails).where(and(eq(emails.id, id), eq(emails.status, "draft"))).get();
          if (email) {
            db.update(emails).set({ status: "approved", updatedAt: new Date().toISOString() }).where(eq(emails.id, id)).run();
            db.update(leads).set({ status: "email_approved" }).where(eq(leads.id, email.leadId)).run();
            db.insert(jobQueue).values({ type: "send_email", leadId: email.leadId, campaignId: email.campaignId }).run();
            logActivity("email_approved", `Email approved via MCP for lead ID ${email.leadId}`, { leadId: email.leadId, campaignId: email.campaignId ?? undefined });
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
            logActivity("wa_approved", `WhatsApp approved via MCP for lead ID ${msg.leadId}`, { leadId: msg.leadId, campaignId: msg.campaignId ?? undefined });
            approvedWA++;
          }
        }
      }

      if (approvedEmails === 0 && approvedWA === 0) {
        return { content: [{ type: "text", text: "No messages were approved. Check that the IDs are valid draft messages." }] };
      }

      return {
        content: [{
          type: "text",
          text: `Approved: ${approvedEmails} emails, ${approvedWA} WhatsApp messages.\nMessages are queued for sending by the background scheduler.`,
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
      tone: z.string().optional().describe("New tone (profesional, casual, urgente, amigable, etc.)"),
      instructions: z.string().optional().describe("Custom instructions for the AI"),
    },
    async ({ messageId, channel, tone, instructions }) => {
      if (!process.env.GEMINI_API_KEY) {
        return { content: [{ type: "text", text: "Cannot regenerate: GEMINI_API_KEY not configured." }], isError: true };
      }

      if (channel === "email") {
        const email = db.select().from(emails).where(eq(emails.id, messageId)).get();
        if (!email) return { content: [{ type: "text", text: `Email ID ${messageId} not found.` }], isError: true };
        if (email.status !== "draft") return { content: [{ type: "text", text: `Email is not a draft (status: ${email.status}).` }], isError: true };

        const lead = db.select().from(leads).where(eq(leads.id, email.leadId)).get();
        if (!lead) return { content: [{ type: "text", text: `Lead not found for this email.` }], isError: true };

        const { regenerateEmail } = await import("@/lib/gemini");
        const result = await regenerateEmail(
          lead.name, lead.category, lead.city, lead.website,
          lead.analysisJson ? JSON.parse(lead.analysisJson) : undefined,
          tone || email.tone, instructions
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

        const { regenerateWhatsApp } = await import("@/lib/gemini");
        const result = await regenerateWhatsApp(
          lead.name, lead.category, lead.city, lead.website,
          lead.analysisJson ? JSON.parse(lead.analysisJson) : undefined,
          tone || msg.tone, instructions
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
