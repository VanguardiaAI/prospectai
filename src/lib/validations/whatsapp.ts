import { z } from "zod";

export const bulkApproveWASchema = z.object({
  bulkApprove: z.literal(true),
  ids: z.array(z.number().int().positive()).min(1),
});

export const updateWASchema = z.object({
  id: z.number().int().positive("ID is required"),
  body: z.string().optional(),
  status: z.enum(["draft", "approved", "rejected"]).optional(),
});

export const regenerateWASchema = z.object({
  messageId: z.number().int().positive("messageId is required"),
  tone: z.string().optional(),
  instructions: z.string().optional(),
});

export const generateWASchema = z.object({
  leadId: z.number().int().positive("leadId is required"),
  action: z.literal("generate"),
  tone: z.string().optional(),
});

export const manualWASchema = z.object({
  leadId: z.number().int().positive("leadId is required"),
  action: z.literal("manual"),
  body: z.string().min(1, "Message body is required"),
  tone: z.string().optional(),
});

export const sendWASchema = z.object({
  messageId: z.number().int().positive("messageId is required"),
  action: z.literal("send"),
});

// Order matters: regenerateWASchema (no `action`) must come LAST, otherwise Zod's
// non-strict parsing strips the `action` key and matches it for send/generate/manual
// payloads — silently turning a "send" into a "regenerate".
export const waPostSchema = z.union([generateWASchema, manualWASchema, sendWASchema, regenerateWASchema]);
