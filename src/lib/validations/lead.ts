import { z } from "zod";

const leadStatusEnum = z.enum([
  "imported", "queued", "scraping", "scraped", "analyzing", "analyzed",
  "email_generated", "email_approved", "email_sent",
  "wa_generated", "wa_approved", "wa_sent",
  "contacted", "replied", "rejected", "blacklisted", "error",
]);

export const updateLeadSchema = z.object({
  id: z.number().int().positive("ID is required"),
  contactEmail: z.string().email().optional(),
  notes: z.string().optional(),
  status: leadStatusEnum.optional(),
  campaignId: z.number().int().positive().optional(),
});

export const bulkUpdateLeadsSchema = z.object({
  bulkIds: z.array(z.number().int().positive()).min(1),
  status: leadStatusEnum.optional(),
  campaignId: z.number().int().positive().optional(),
});

export const deleteLeadSchema = z.union([
  z.object({ id: z.number().int().positive() }),
  z.object({ bulkIds: z.array(z.number().int().positive()).min(1) }),
]);

export const outreachActionSchema = z.object({
  action: z.enum(["analyze", "generate_email", "generate_wa", "create_email", "create_wa"]),
  tone: z.string().optional(),
  subject: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  body: z.string().optional(),
});
