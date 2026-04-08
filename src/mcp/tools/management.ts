import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { db, getSetting } from "@/db";
import {
  blacklist, leads, emails, whatsappMessages, sequenceSteps,
  sequenceEnrollments, emailTemplates, sendingDomains, abVariants,
  abResults, jobQueue, campaigns,
} from "@/db/schema";
import { eq, and, sql, desc, isNotNull } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { paginationParams } from "../helpers/pagination.js";

export function registerManagementTools(server: McpServer) {
  // ─── BLACKLIST ─────────────────────────────────────────────────────────

  server.tool(
    "manage_blacklist",
    "Add, remove, or list blacklisted domains/emails/businesses. Essential for RGPD compliance. Blacklisted entries are skipped during generation and sending.",
    {
      action: z.enum(["add", "remove", "list"]).describe("Action to perform"),
      type: z.enum(["domain", "email", "business"]).optional().describe("Type of blacklist entry (required for add)"),
      value: z.string().optional().describe("Value to add/remove (e.g., 'spam.com', 'user@spam.com', 'Spam Corp')"),
      reason: z.string().optional().describe("Reason for blacklisting (add only)"),
      page: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
    async ({ action, type, value, reason, page, limit }) => {
      if (action === "add") {
        if (!type || !value) {
          return { content: [{ type: "text", text: "Both 'type' and 'value' are required for adding to blacklist." }], isError: true };
        }
        const existing = db.select().from(blacklist).where(eq(blacklist.value, value.toLowerCase())).get();
        if (existing) {
          return { content: [{ type: "text", text: `Already blacklisted: "${value}" (${existing.type})` }] };
        }
        db.insert(blacklist).values({
          type,
          value: value.toLowerCase(),
          reason: reason ?? null,
        }).run();
        logActivity("blacklist", `Added to blacklist via MCP: ${type} "${value}"${reason ? ` - ${reason}` : ""}`, { messageKey: "activityLog.leadBlacklisted", messageVars: { name: `${type} "${value}"` } });
        return { content: [{ type: "text", text: `Added to blacklist: ${type} "${value}"` }] };
      }

      if (action === "remove") {
        if (!value) {
          return { content: [{ type: "text", text: "'value' is required for removing from blacklist." }], isError: true };
        }
        const entry = db.select().from(blacklist).where(eq(blacklist.value, value.toLowerCase())).get();
        if (!entry) {
          return { content: [{ type: "text", text: `"${value}" not found in blacklist.` }] };
        }
        db.delete(blacklist).where(eq(blacklist.id, entry.id)).run();
        logActivity("blacklist", `Removed from blacklist via MCP: ${entry.type} "${value}"`, { messageKey: "activityLog.leadBlacklisted", messageVars: { name: `${entry.type} "${value}"` } });
        return { content: [{ type: "text", text: `Removed from blacklist: ${entry.type} "${value}"` }] };
      }

      // List
      const { page: p, limit: l, offset } = paginationParams(page, limit);
      const conditions = [];
      if (type) conditions.push(eq(blacklist.type, type));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const total = db.select({ count: sql<number>`count(*)` }).from(blacklist).where(where).get()?.count ?? 0;
      const entries = db.select().from(blacklist)
        .where(where)
        .orderBy(desc(blacklist.createdAt))
        .limit(l)
        .offset(offset)
        .all();

      const lines = [`# Blacklist (${total} total, page ${p})\n`];
      for (const e of entries) {
        lines.push(`[ID:${e.id}] ${e.type}: "${e.value}"${e.reason ? ` (${e.reason})` : ""}`);
      }
      if (entries.length === 0) lines.push("Blacklist is empty.");
      if (offset + l < total) lines.push(`\n... more. Use page=${p + 1}`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ─── SEQUENCES ─────────────────────────────────────────────────────────

  server.tool(
    "manage_sequences",
    "Create, view, or update multi-step follow-up sequences for campaigns. Sequences auto-send follow-ups if leads don't reply.",
    {
      action: z.enum(["create", "list", "update", "enroll"]).describe("Action to perform"),
      campaignId: z.number().int().describe("Campaign ID"),
      // For create/update
      stepNumber: z.number().int().positive().optional().describe("Step number in sequence"),
      channel: z.enum(["email", "whatsapp"]).optional().describe("Channel for this step"),
      delayDays: z.number().int().positive().optional().describe("Days to wait after previous step"),
      tone: z.string().optional().describe("Tone for this step"),
      customInstructions: z.string().optional().describe("Custom AI instructions for this step"),
      enabled: z.boolean().optional().describe("Enable/disable this step"),
      // For enroll
      leadIds: z.array(z.number().int()).max(50).optional().describe("Lead IDs to enroll in sequence"),
    },
    async ({ action, campaignId, stepNumber, channel, delayDays, tone, customInstructions, enabled, leadIds }) => {
      const campaign = db.select().from(campaigns).where(eq(campaigns.id, campaignId)).get();
      if (!campaign) return { content: [{ type: "text", text: `Campaign ID ${campaignId} not found.` }], isError: true };

      if (action === "create") {
        if (!channel) return { content: [{ type: "text", text: "'channel' is required for creating a sequence step." }], isError: true };

        const existingSteps = db.select({ count: sql<number>`count(*)` }).from(sequenceSteps)
          .where(eq(sequenceSteps.campaignId, campaignId)).get()?.count ?? 0;

        const step = db.insert(sequenceSteps).values({
          campaignId,
          stepNumber: stepNumber ?? existingSteps + 1,
          channel,
          delayDays: delayDays ?? 3,
          tone: tone ?? campaign.defaultTone,
          customInstructions: customInstructions ?? null,
          enabled: enabled ?? true,
        }).returning().get();

        logActivity("campaign_change", `Sequence step ${step.stepNumber} created for "${campaign.name}"`, { campaignId, messageKey: "activityLog.campaignUpdated", messageVars: { name: campaign.name } });
        return { content: [{ type: "text", text: `Sequence step ${step.stepNumber} created: ${step.channel} after ${step.delayDays} days (tone: ${step.tone})` }] };
      }

      if (action === "update") {
        if (!stepNumber) return { content: [{ type: "text", text: "'stepNumber' is required for updating." }], isError: true };

        const step = db.select().from(sequenceSteps)
          .where(and(eq(sequenceSteps.campaignId, campaignId), eq(sequenceSteps.stepNumber, stepNumber)))
          .get();
        if (!step) return { content: [{ type: "text", text: `Step ${stepNumber} not found in campaign ${campaignId}.` }], isError: true };

        const updates: Record<string, unknown> = {};
        if (channel !== undefined) updates.channel = channel;
        if (delayDays !== undefined) updates.delayDays = delayDays;
        if (tone !== undefined) updates.tone = tone;
        if (customInstructions !== undefined) updates.customInstructions = customInstructions;
        if (enabled !== undefined) updates.enabled = enabled;

        if (Object.keys(updates).length === 0) return { content: [{ type: "text", text: "No changes specified." }] };

        db.update(sequenceSteps).set(updates).where(eq(sequenceSteps.id, step.id)).run();
        return { content: [{ type: "text", text: `Step ${stepNumber} updated: ${Object.keys(updates).join(", ")}` }] };
      }

      if (action === "enroll") {
        if (!leadIds?.length) return { content: [{ type: "text", text: "'leadIds' required for enrollment." }], isError: true };

        const steps = db.select().from(sequenceSteps)
          .where(and(eq(sequenceSteps.campaignId, campaignId), eq(sequenceSteps.enabled, true)))
          .orderBy(sequenceSteps.stepNumber).all();

        if (steps.length === 0) return { content: [{ type: "text", text: "No enabled sequence steps found for this campaign." }], isError: true };

        let enrolled = 0;
        for (const leadId of leadIds) {
          const existing = db.select().from(sequenceEnrollments)
            .where(and(eq(sequenceEnrollments.leadId, leadId), eq(sequenceEnrollments.campaignId, campaignId), eq(sequenceEnrollments.status, "active")))
            .get();
          if (existing) continue;

          const nextActionAt = new Date();
          nextActionAt.setDate(nextActionAt.getDate() + steps[0].delayDays);

          db.insert(sequenceEnrollments).values({
            leadId,
            campaignId,
            currentStep: 1,
            status: "active",
            nextActionAt: nextActionAt.toISOString(),
          }).run();
          enrolled++;
        }

        logActivity("campaign_change", `${enrolled} leads enrolled in sequence for "${campaign.name}"`, { campaignId, messageKey: "activityLog.campaignUpdated", messageVars: { name: campaign.name } });
        return { content: [{ type: "text", text: `Enrolled ${enrolled} leads in ${steps.length}-step sequence.` }] };
      }

      // List
      const steps = db.select().from(sequenceSteps)
        .where(eq(sequenceSteps.campaignId, campaignId))
        .orderBy(sequenceSteps.stepNumber).all();

      const activeEnrollments = db.select({ count: sql<number>`count(*)` }).from(sequenceEnrollments)
        .where(and(eq(sequenceEnrollments.campaignId, campaignId), eq(sequenceEnrollments.status, "active")))
        .get()?.count ?? 0;

      const lines = [`# Sequence for "${campaign.name}" [ID:${campaignId}]\n`];
      lines.push(`Active enrollments: ${activeEnrollments}\n`);

      if (steps.length === 0) {
        lines.push("No sequence steps defined. Use action='create' to add steps.");
      } else {
        lines.push("## Steps");
        for (const s of steps) {
          lines.push(`  Step ${s.stepNumber}: ${s.channel} | ${s.delayDays}d delay | ${s.tone}${s.enabled ? "" : " | DISABLED"}${s.customInstructions ? ` | "${s.customInstructions.slice(0, 40)}..."` : ""}`);
        }
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ─── TEMPLATES ─────────────────────────────────────────────────────────

  server.tool(
    "manage_templates",
    "Create, list, or view reusable email/WhatsApp templates. Templates can be used as a base for AI-generated messages.",
    {
      action: z.enum(["create", "list", "get"]).describe("Action to perform"),
      templateId: z.number().int().optional().describe("Template ID (for get)"),
      name: z.string().optional().describe("Template name (for create)"),
      channel: z.enum(["email", "whatsapp"]).optional().describe("Channel (for create)"),
      category: z.string().optional().describe("Template category (for create/list filter)"),
      subjectTemplate: z.string().optional().describe("Subject template with {{variables}} (email only)"),
      bodyHtmlTemplate: z.string().optional().describe("HTML body template (email only)"),
      bodyTextTemplate: z.string().optional().describe("Text body template"),
      variables: z.array(z.string()).optional().describe("Variable names used in template"),
      page: z.number().int().positive().optional(),
      limit: z.number().int().min(1).max(20).optional(),
    },
    async ({ action, templateId, name, channel, category, subjectTemplate, bodyHtmlTemplate, bodyTextTemplate, variables, page, limit }) => {
      if (action === "create") {
        if (!name || !channel || !bodyTextTemplate) {
          return { content: [{ type: "text", text: "'name', 'channel', and 'bodyTextTemplate' are required." }], isError: true };
        }

        const template = db.insert(emailTemplates).values({
          name,
          channel,
          category: category ?? null,
          subjectTemplate: subjectTemplate ?? "",
          bodyHtmlTemplate: bodyHtmlTemplate ?? bodyTextTemplate,
          bodyTextTemplate,
          variables: variables ? JSON.stringify(variables) : null,
        }).returning().get();

        return { content: [{ type: "text", text: `Template created: [ID:${template.id}] "${template.name}" (${template.channel})` }] };
      }

      if (action === "get") {
        if (!templateId) return { content: [{ type: "text", text: "'templateId' is required." }], isError: true };
        const tmpl = db.select().from(emailTemplates).where(eq(emailTemplates.id, templateId)).get();
        if (!tmpl) return { content: [{ type: "text", text: `Template ID ${templateId} not found.` }], isError: true };

        const vars = tmpl.variables ? JSON.parse(tmpl.variables) : [];
        const lines = [
          `# Template: ${tmpl.name} [ID:${tmpl.id}]`,
          `Channel: ${tmpl.channel} | Category: ${tmpl.category ?? "none"} | Used: ${tmpl.usageCount}x`,
          vars.length > 0 ? `Variables: ${vars.join(", ")}` : "",
          tmpl.subjectTemplate ? `\nSubject: ${tmpl.subjectTemplate}` : "",
          `\n---\n${tmpl.bodyTextTemplate}`,
        ].filter(Boolean);

        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      // List
      const { page: p, limit: l, offset } = paginationParams(page, limit);
      const conditions = [];
      if (channel) conditions.push(eq(emailTemplates.channel, channel));
      if (category) conditions.push(eq(emailTemplates.category, category));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const total = db.select({ count: sql<number>`count(*)` }).from(emailTemplates).where(where).get()?.count ?? 0;
      const templates = db.select().from(emailTemplates)
        .where(where)
        .orderBy(desc(emailTemplates.createdAt))
        .limit(l)
        .offset(offset)
        .all();

      const lines = [`# Templates (${total} total, page ${p})\n`];
      for (const t of templates) {
        lines.push(`[ID:${t.id}] "${t.name}" | ${t.channel} | ${t.category ?? "no category"} | Used ${t.usageCount}x${t.avgOpenRate != null ? ` | ${Math.round(t.avgOpenRate * 100)}% open` : ""}`);
      }
      if (templates.length === 0) lines.push("No templates found.");
      if (offset + l < total) lines.push(`\n... more. Use page=${p + 1}`);

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ─── SENDING DOMAINS ──────────────────────────────────────────────────

  server.tool(
    "manage_sending_domains",
    "View and manage sending domains for email rotation and warmup tracking.",
    {
      action: z.enum(["list", "add", "update"]).describe("Action to perform"),
      domainId: z.number().int().optional().describe("Domain ID (for update)"),
      domain: z.string().optional().describe("Domain name (for add)"),
      fromEmail: z.string().optional().describe("From email address"),
      fromName: z.string().optional().describe("From display name"),
      dailyLimit: z.number().int().positive().optional().describe("Daily send limit"),
      status: z.enum(["active", "warming", "paused"]).optional().describe("Domain status"),
    },
    async ({ action, domainId, domain, fromEmail, fromName, dailyLimit, status }) => {
      if (action === "add") {
        if (!domain || !fromEmail || !fromName) {
          return { content: [{ type: "text", text: "'domain', 'fromEmail', and 'fromName' are required." }], isError: true };
        }

        const d = db.insert(sendingDomains).values({
          domain,
          fromEmail,
          fromName,
          dailyLimit: dailyLimit ?? 30,
          status: status ?? "warming",
        }).returning().get();

        logActivity("setting_change", `Sending domain added: ${domain}`, { metadata: { domainId: d.id }, messageKey: "activityLog.configUpdated", messageVars: { fields: `domain: ${domain}` } });
        return { content: [{ type: "text", text: `Domain added: [ID:${d.id}] ${domain} <${fromEmail}> (${d.status})` }] };
      }

      if (action === "update") {
        if (!domainId) return { content: [{ type: "text", text: "'domainId' is required for update." }], isError: true };
        const existing = db.select().from(sendingDomains).where(eq(sendingDomains.id, domainId)).get();
        if (!existing) return { content: [{ type: "text", text: `Domain ID ${domainId} not found.` }], isError: true };

        const updates: Record<string, unknown> = {};
        if (fromEmail) updates.fromEmail = fromEmail;
        if (fromName) updates.fromName = fromName;
        if (dailyLimit) updates.dailyLimit = dailyLimit;
        if (status) updates.status = status;

        if (Object.keys(updates).length === 0) return { content: [{ type: "text", text: "No changes specified." }] };

        db.update(sendingDomains).set(updates).where(eq(sendingDomains.id, domainId)).run();
        return { content: [{ type: "text", text: `Domain [ID:${domainId}] updated: ${Object.keys(updates).join(", ")}` }] };
      }

      // List
      const domains = db.select().from(sendingDomains).orderBy(sendingDomains.domain).all();
      const lines = [`# Sending Domains (${domains.length})\n`];
      for (const d of domains) {
        const sentToday = db.select({ count: sql<number>`count(*)` }).from(emails)
          .where(and(
            eq(emails.status, "sent"),
            eq(emails.fromEmail, d.fromEmail),
            sql`date(${emails.sentAt}) = date('now')`,
          )).get()?.count ?? 0;

        lines.push(`[ID:${d.id}] ${d.domain} | ${d.fromEmail} | ${d.status} | Warmup day ${d.warmupDay} | Sent today: ${sentToday}/${d.dailyLimit}`);
      }
      if (domains.length === 0) lines.push("No sending domains configured.");

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ─── RETRY FAILED MESSAGES ─────────────────────────────────────────────

  server.tool(
    "retry_failed_messages",
    "Retry sending messages that previously failed. Resets status back to 'approved' and re-queues for sending.",
    {
      emailIds: z.array(z.number().int()).optional().describe("Failed email IDs to retry"),
      whatsappIds: z.array(z.number().int()).optional().describe("Failed WhatsApp message IDs to retry"),
      campaignId: z.number().int().optional().describe("Retry ALL failed messages in this campaign"),
    },
    async ({ emailIds, whatsappIds, campaignId }) => {
      // Bulk retry by campaign
      if (campaignId && !emailIds?.length && !whatsappIds?.length) {
        const failedEmails = db.select({ id: emails.id }).from(emails)
          .where(and(eq(emails.campaignId, campaignId), eq(emails.status, "failed"))).all();
        const failedWA = db.select({ id: whatsappMessages.id }).from(whatsappMessages)
          .where(and(eq(whatsappMessages.campaignId, campaignId), eq(whatsappMessages.status, "failed"))).all();

        emailIds = failedEmails.map(e => e.id);
        whatsappIds = failedWA.map(w => w.id);

        if (emailIds.length === 0 && whatsappIds.length === 0) {
          return { content: [{ type: "text", text: `No failed messages in campaign ID ${campaignId}.` }] };
        }
      }

      let retriedEmails = 0;
      let retriedWA = 0;

      if (emailIds?.length) {
        for (const id of emailIds) {
          const email = db.select().from(emails).where(and(eq(emails.id, id), eq(emails.status, "failed"))).get();
          if (email) {
            db.update(emails).set({ status: "approved", updatedAt: new Date().toISOString() }).where(eq(emails.id, id)).run();
            // Reset existing failed jobs instead of creating duplicates
            const existingJob = db.select().from(jobQueue)
              .where(and(eq(jobQueue.type, "send_email"), eq(jobQueue.leadId, email.leadId), eq(jobQueue.status, "failed")))
              .get();
            if (existingJob) {
              db.update(jobQueue).set({ status: "pending", attempts: 0, errorMessage: null, processedAt: null }).where(eq(jobQueue.id, existingJob.id)).run();
            } else {
              db.insert(jobQueue).values({ type: "send_email", leadId: email.leadId, campaignId: email.campaignId }).run();
            }
            logActivity("email_approved", `Email retried via MCP`, { leadId: email.leadId, campaignId: email.campaignId ?? undefined, messageKey: "activityLog.emailApproved" });
            retriedEmails++;
          }
        }
      }

      if (whatsappIds?.length) {
        for (const id of whatsappIds) {
          const msg = db.select().from(whatsappMessages).where(and(eq(whatsappMessages.id, id), eq(whatsappMessages.status, "failed"))).get();
          if (msg) {
            db.update(whatsappMessages).set({ status: "approved", updatedAt: new Date().toISOString() }).where(eq(whatsappMessages.id, id)).run();
            // Reset existing failed jobs instead of creating duplicates
            const existingJob = db.select().from(jobQueue)
              .where(and(eq(jobQueue.type, "send_wa"), eq(jobQueue.leadId, msg.leadId), eq(jobQueue.status, "failed")))
              .get();
            if (existingJob) {
              db.update(jobQueue).set({ status: "pending", attempts: 0, errorMessage: null, processedAt: null }).where(eq(jobQueue.id, existingJob.id)).run();
            } else {
              db.insert(jobQueue).values({ type: "send_wa", leadId: msg.leadId, campaignId: msg.campaignId }).run();
            }
            logActivity("wa_approved", `WhatsApp retried via MCP`, { leadId: msg.leadId, campaignId: msg.campaignId ?? undefined, messageKey: "activityLog.waApproved" });
            retriedWA++;
          }
        }
      }

      if (retriedEmails === 0 && retriedWA === 0) {
        return { content: [{ type: "text", text: "No failed messages to retry." }] };
      }

      return { content: [{ type: "text", text: `Retried: ${retriedEmails} emails, ${retriedWA} WhatsApp messages. Re-queued for sending.` }] };
    }
  );

  // ─── LEAD NOTES ────────────────────────────────────────────────────────

  server.tool(
    "update_lead",
    "Update a lead's notes, contact email override, or status. Useful for adding context or manually correcting lead data.",
    {
      leadId: z.number().int().describe("Lead ID"),
      notes: z.string().optional().describe("Notes to add/update on the lead"),
      contactEmail: z.string().optional().describe("Override the contact email for this lead"),
      status: z.enum(["imported", "queued", "scraping", "scraped", "analyzing", "analyzed", "email_generated", "email_approved", "email_sent", "wa_generated", "wa_approved", "wa_sent", "contacted", "replied", "rejected", "blacklisted", "error"]).optional().describe("Manually set lead status"),
    },
    async ({ leadId, notes, contactEmail, status }) => {
      const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
      if (!lead) return { content: [{ type: "text", text: `Lead ID ${leadId} not found.` }], isError: true };

      const updates: Record<string, unknown> = {};
      const changed: string[] = [];

      if (notes !== undefined) { updates.notes = notes; changed.push("notes"); }
      if (contactEmail !== undefined) { updates.contactEmail = contactEmail; changed.push("contactEmail"); }
      if (status !== undefined) { updates.status = status; changed.push("status"); }

      if (changed.length === 0) return { content: [{ type: "text", text: "No changes specified." }] };

      db.update(leads).set(updates).where(eq(leads.id, leadId)).run();
      logActivity("lead_prioritized", `Lead "${lead.name}" updated via MCP: ${changed.join(", ")}`, { leadId, messageKey: "activityLog.campaignUpdated", messageVars: { name: lead.name } });

      return { content: [{ type: "text", text: `Lead [ID:${leadId}] "${lead.name}" updated: ${changed.join(", ")}` }] };
    }
  );

  // ─── A/B TESTING ───────────────────────────────────────────────────────

  server.tool(
    "manage_ab_tests",
    "Create, view, and analyze A/B test results for email/WhatsApp outreach campaigns.",
    {
      action: z.enum(["create", "list", "results"]).describe("Action to perform"),
      campaignId: z.number().int().optional().describe("Campaign ID"),
      variantId: z.number().int().optional().describe("Variant ID (for results)"),
      name: z.string().optional().describe("Test name (for create)"),
      channel: z.enum(["email", "whatsapp", "both"]).optional().describe("Channel to test"),
      variantA: z.object({
        tone: z.string().optional(),
        instructions: z.string().optional(),
      }).optional().describe("Variant A configuration"),
      variantB: z.object({
        tone: z.string().optional(),
        instructions: z.string().optional(),
      }).optional().describe("Variant B configuration"),
    },
    async ({ action, campaignId, variantId, name, channel, variantA, variantB }) => {
      if (action === "create") {
        if (!campaignId || !name || !variantA || !variantB) {
          return { content: [{ type: "text", text: "'campaignId', 'name', 'variantA', and 'variantB' are required." }], isError: true };
        }

        const test = db.insert(abVariants).values({
          campaignId,
          name,
          channel: channel ?? "email",
          variantA: JSON.stringify(variantA),
          variantB: JSON.stringify(variantB),
          status: "active",
        }).returning().get();

        logActivity("campaign_change", `A/B test "${name}" created for campaign ${campaignId}`, { campaignId, messageKey: "activityLog.campaignUpdated", messageVars: { name: name ?? "" } });
        return { content: [{ type: "text", text: `A/B test created: [ID:${test.id}] "${name}" (${test.channel})` }] };
      }

      if (action === "results") {
        if (!variantId) return { content: [{ type: "text", text: "'variantId' is required for results." }], isError: true };

        const test = db.select().from(abVariants).where(eq(abVariants.id, variantId)).get();
        if (!test) return { content: [{ type: "text", text: `A/B test ID ${variantId} not found.` }], isError: true };

        const results = db.select().from(abResults).where(eq(abResults.variantId, variantId)).all();

        const groupA = results.filter(r => r.variantGroup === "A");
        const groupB = results.filter(r => r.variantGroup === "B");

        const stats = (group: typeof results) => ({
          total: group.length,
          opened: group.filter(r => r.opened).length,
          clicked: group.filter(r => r.clicked).length,
          replied: group.filter(r => r.replied).length,
        });

        const a = stats(groupA);
        const b = stats(groupB);

        const pct = (n: number, d: number) => d > 0 ? `${Math.round((n / d) * 100)}%` : "0%";

        const configA = JSON.parse(test.variantA);
        const configB = JSON.parse(test.variantB);

        const lines = [
          `# A/B Test: ${test.name} [ID:${test.id}]`,
          `Status: ${test.status} | Channel: ${test.channel}\n`,
          `## Variant A${configA.tone ? ` (${configA.tone})` : ""}`,
          `  Sent: ${a.total} | Opened: ${a.opened} (${pct(a.opened, a.total)}) | Clicked: ${a.clicked} (${pct(a.clicked, a.opened)}) | Replied: ${a.replied} (${pct(a.replied, a.total)})`,
          `\n## Variant B${configB.tone ? ` (${configB.tone})` : ""}`,
          `  Sent: ${b.total} | Opened: ${b.opened} (${pct(b.opened, b.total)}) | Clicked: ${b.clicked} (${pct(b.clicked, b.opened)}) | Replied: ${b.replied} (${pct(b.replied, b.total)})`,
        ];

        if (a.total >= 10 && b.total >= 10) {
          const winnerOpen = a.opened / a.total > b.opened / b.total ? "A" : "B";
          const winnerReply = a.replied / a.total > b.replied / b.total ? "A" : "B";
          lines.push(`\n## Winner (preliminary)`);
          lines.push(`  Open rate: Variant ${winnerOpen} | Reply rate: Variant ${winnerReply}`);
        } else {
          lines.push(`\nNeed at least 10 sends per variant for meaningful comparison (A: ${a.total}, B: ${b.total}).`);
        }

        return { content: [{ type: "text", text: lines.join("\n") }] };
      }

      // List
      const conditions = [];
      if (campaignId) conditions.push(eq(abVariants.campaignId, campaignId));
      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const tests = db.select().from(abVariants).where(where).orderBy(desc(abVariants.createdAt)).all();
      const lines = [`# A/B Tests (${tests.length})\n`];
      for (const t of tests) {
        const count = db.select({ count: sql<number>`count(*)` }).from(abResults)
          .where(eq(abResults.variantId, t.id)).get()?.count ?? 0;
        lines.push(`[ID:${t.id}] "${t.name}" | ${t.channel} | ${t.status} | ${count} sends`);
      }
      if (tests.length === 0) lines.push("No A/B tests found.");

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );

  // ─── BOUNCE & DELIVERY STATS ──────────────────────────────────────────

  server.tool(
    "get_delivery_stats",
    "Get email delivery statistics including bounce rate, failure rate, and sending health. Shows per-domain breakdown if multiple domains are configured.",
    {
      days: z.number().int().min(1).max(90).optional().describe("Look-back period in days (default 7)"),
      campaignId: z.number().int().optional().describe("Filter by campaign"),
    },
    async ({ days = 7, campaignId }) => {
      const since = new Date();
      since.setDate(since.getDate() - days);
      const sinceStr = since.toISOString();

      const conditions = [sql`${emails.createdAt} >= ${sinceStr}`];
      if (campaignId) conditions.push(eq(emails.campaignId, campaignId));

      const totalSent = db.select({ count: sql<number>`count(*)` }).from(emails)
        .where(and(eq(emails.status, "sent"), ...conditions)).get()?.count ?? 0;
      const totalFailed = db.select({ count: sql<number>`count(*)` }).from(emails)
        .where(and(eq(emails.status, "failed"), ...conditions)).get()?.count ?? 0;
      const totalOpened = db.select({ count: sql<number>`count(*)` }).from(emails)
        .where(and(eq(emails.status, "sent"), isNotNull(emails.openedAt), ...conditions)).get()?.count ?? 0;
      const totalClicked = db.select({ count: sql<number>`count(*)` }).from(emails)
        .where(and(eq(emails.status, "sent"), isNotNull(emails.clickedAt), ...conditions)).get()?.count ?? 0;

      // WhatsApp stats
      const waConditions = [sql`${whatsappMessages.createdAt} >= ${sinceStr}`];
      if (campaignId) waConditions.push(eq(whatsappMessages.campaignId, campaignId));

      const waSent = db.select({ count: sql<number>`count(*)` }).from(whatsappMessages)
        .where(and(eq(whatsappMessages.status, "sent"), ...waConditions)).get()?.count ?? 0;
      const waFailed = db.select({ count: sql<number>`count(*)` }).from(whatsappMessages)
        .where(and(eq(whatsappMessages.status, "failed"), ...waConditions)).get()?.count ?? 0;

      const failureRate = (totalSent + totalFailed) > 0 ? Math.round((totalFailed / (totalSent + totalFailed)) * 100) : 0;
      const openRate = totalSent > 0 ? Math.round((totalOpened / totalSent) * 100) : 0;
      const clickRate = totalOpened > 0 ? Math.round((totalClicked / totalOpened) * 100) : 0;

      const warmupEnabled = getSetting("warmup_enabled") === "true";
      const warmupDay = parseInt(getSetting("warmup_day") || "1");
      const bounceThreshold = 5; // matching email-sending.ts

      const lines = [
        `# Delivery Stats (last ${days} days)\n`,
        `## Email`,
        `  Sent: ${totalSent} | Failed: ${totalFailed}`,
        `  Failure rate: ${failureRate}%${failureRate >= bounceThreshold ? ` !! ABOVE THRESHOLD (${bounceThreshold}%) — sending may be paused` : ""}`,
        `  Open rate: ${openRate}% | Click rate: ${clickRate}%`,
        warmupEnabled ? `  Warmup: Day ${warmupDay} (active)` : `  Warmup: disabled`,
        `\n## WhatsApp`,
        `  Sent: ${waSent} | Failed: ${waFailed}`,
        waFailed > 0 ? `  Failure rate: ${Math.round((waFailed / (waSent + waFailed)) * 100)}%` : "",
      ].filter(Boolean);

      // Per-domain breakdown
      const domains = db.select().from(sendingDomains).all();
      if (domains.length > 0) {
        lines.push(`\n## Per-Domain Breakdown`);
        for (const d of domains) {
          const domainSent = db.select({ count: sql<number>`count(*)` }).from(emails)
            .where(and(
              eq(emails.status, "sent"),
              eq(emails.fromEmail, d.fromEmail),
              sql`${emails.createdAt} >= ${sinceStr}`,
            )).get()?.count ?? 0;
          const domainFailed = db.select({ count: sql<number>`count(*)` }).from(emails)
            .where(and(
              eq(emails.status, "failed"),
              eq(emails.fromEmail, d.fromEmail),
              sql`${emails.createdAt} >= ${sinceStr}`,
            )).get()?.count ?? 0;

          lines.push(`  ${d.domain}: ${domainSent} sent, ${domainFailed} failed | Warmup day ${d.warmupDay} | ${d.status}`);
        }
      }

      return { content: [{ type: "text", text: lines.join("\n") }] };
    }
  );
}
