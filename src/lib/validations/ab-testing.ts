import { z } from "zod";

export const createABTestSchema = z.object({
  campaignId: z.number().int().positive().optional(),
  name: z.string().min(1, "Name is required"),
  variantA: z.object({
    tone: z.string().optional(),
    instructions: z.string().optional(),
  }),
  variantB: z.object({
    tone: z.string().optional(),
    instructions: z.string().optional(),
  }),
  channel: z.enum(["email", "whatsapp", "both"]).optional(),
});

export const updateABTestSchema = z.object({
  id: z.number().int().positive("ID is required"),
  status: z.enum(["active", "paused", "completed"]).optional(),
  winnerId: z.string().optional(),
});
