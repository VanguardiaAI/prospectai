import { db } from "@/db";
import { emailTemplates, emails } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { NotFoundError } from "./errors";

// ─── Types ──────────────────────────────────────────────────────────

export interface CreateTemplateInput {
  name: string;
  channel?: "email" | "whatsapp";
  category?: string;
  subjectTemplate: string;
  bodyHtmlTemplate: string;
  bodyTextTemplate: string;
  variables?: string[];
}

export interface UpdateTemplateInput {
  name?: string;
  channel?: "email" | "whatsapp";
  category?: string;
  subjectTemplate?: string;
  bodyHtmlTemplate?: string;
  bodyTextTemplate?: string;
  variables?: string[];
}

// ─── Service Functions ──────────────────────────────────────────────

export function listTemplates(opts?: { category?: string }) {
  if (opts?.category) {
    return db.select().from(emailTemplates).where(eq(emailTemplates.category, opts.category)).all();
  }
  return db.select().from(emailTemplates).all();
}

export function getTemplate(id: number) {
  const template = db.select().from(emailTemplates).where(eq(emailTemplates.id, id)).get();
  if (!template) throw new NotFoundError("Template", id);
  return template;
}

export function createTemplate(input: CreateTemplateInput) {
  const result = db.insert(emailTemplates).values({
    name: input.name,
    channel: input.channel || "email",
    category: input.category || null,
    subjectTemplate: input.subjectTemplate,
    bodyHtmlTemplate: input.bodyHtmlTemplate,
    bodyTextTemplate: input.bodyTextTemplate,
    variables: JSON.stringify(input.variables || []),
  }).returning().get();

  logActivity("email_generated", `Template "${input.name}" creada`, {
    messageKey: "activityLog.templateCreated",
    messageVars: { name: input.name },
  });

  return result;
}

export function createTemplateFromEmail(emailId: number, opts?: { name?: string; category?: string }) {
  const email = db.select().from(emails).where(eq(emails.id, emailId)).get();
  if (!email) throw new NotFoundError("Email", emailId);

  // Extract variables from the template ({{variable_name}} pattern)
  const variableMatches = email.bodyHtml.match(/\{\{(\w+)\}\}/g) || [];
  const variables = [...new Set(variableMatches.map((m) => m.replace(/\{\{|\}\}/g, "")))];

  const result = db.insert(emailTemplates).values({
    name: opts?.name || `Template de ${email.subject}`,
    category: opts?.category || null,
    subjectTemplate: email.subject,
    bodyHtmlTemplate: email.bodyHtml,
    bodyTextTemplate: email.bodyText,
    variables: JSON.stringify(variables),
  }).returning().get();

  logActivity("email_generated", `Template creada desde email #${emailId}`, {
    messageKey: "activityLog.templateCreatedFromEmail",
    messageVars: { name: result.name },
  });

  return result;
}

export function updateTemplate(id: number, updates: UpdateTemplateInput) {
  const existing = db.select().from(emailTemplates).where(eq(emailTemplates.id, id)).get();
  if (!existing) throw new NotFoundError("Template", id);

  const allowed: Record<string, unknown> = {};
  if (updates.name !== undefined) allowed.name = updates.name;
  if (updates.channel !== undefined) allowed.channel = updates.channel;
  if (updates.category !== undefined) allowed.category = updates.category;
  if (updates.subjectTemplate !== undefined) allowed.subjectTemplate = updates.subjectTemplate;
  if (updates.bodyHtmlTemplate !== undefined) allowed.bodyHtmlTemplate = updates.bodyHtmlTemplate;
  if (updates.bodyTextTemplate !== undefined) allowed.bodyTextTemplate = updates.bodyTextTemplate;
  if (updates.variables !== undefined) allowed.variables = JSON.stringify(updates.variables);

  db.update(emailTemplates).set(allowed).where(eq(emailTemplates.id, id)).run();

  return { success: true };
}

export function deleteTemplate(id: number) {
  db.delete(emailTemplates).where(eq(emailTemplates.id, id)).run();
  return { success: true };
}
