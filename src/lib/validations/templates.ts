import { z } from "zod";

export const createTemplateFromEmailSchema = z.object({
  fromEmailId: z.number().int().positive(),
  name: z.string().optional(),
  category: z.string().optional(),
});

export const createTemplateSchema = z.object({
  name: z.string().min(1, "Name is required"),
  channel: z.enum(["email", "whatsapp"]).optional(),
  category: z.string().optional(),
  subjectTemplate: z.string().optional(),
  bodyHtmlTemplate: z.string().optional(),
  bodyTextTemplate: z.string().optional(),
  variables: z.array(z.string()).optional(),
});

export const updateTemplateSchema = z.object({
  id: z.number().int().positive("ID is required"),
  name: z.string().min(1).optional(),
  channel: z.enum(["email", "whatsapp"]).optional(),
  category: z.string().optional(),
  subjectTemplate: z.string().optional(),
  bodyHtmlTemplate: z.string().optional(),
  bodyTextTemplate: z.string().optional(),
  variables: z.array(z.string()).optional(),
});

export const generateTemplateSchema = z.object({
  channel: z.enum(["email", "whatsapp"]),
  industry: z.string().min(1, "Industry is required"),
  purpose: z.enum(["initial", "follow_up", "breakup"]),
  tone: z.string().min(1, "Tone is required"),
  customInstructions: z.string().optional(),
});
