import { z } from "zod";

export const bulkApproveEmailsSchema = z.object({
  bulkApprove: z.literal(true),
  ids: z.array(z.number().int().positive()).min(1),
});

export const updateEmailSchema = z.object({
  id: z.number().int().positive("ID is required"),
  subject: z.string().optional(),
  bodyHtml: z.string().optional(),
  bodyText: z.string().optional(),
  status: z.enum(["draft", "approved", "rejected"]).optional(),
});

export const regenerateEmailSchema = z.object({
  emailId: z.number().int().positive("emailId is required"),
  tone: z.string().optional(),
  instructions: z.string().optional(),
});

export const testEmailSchema = z.object({
  emailId: z.number().int().positive("emailId is required"),
});
