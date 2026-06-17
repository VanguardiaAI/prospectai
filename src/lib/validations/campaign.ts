import { z } from "zod";

export const createCampaignSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  dailyLimit: z.number().int().positive().optional(),
  qualityThreshold: z.number().int().min(0).max(100).optional(),
  autopilot: z.boolean().optional(),
  defaultTone: z.string().optional(),
  strategy: z.enum(["web_design", "seo_visibility"]).optional(),
  agencyProfileId: z.number().int().positive().nullable().optional(),
  channels: z.array(z.enum(["email", "whatsapp"])).min(1).optional(),
});

export const updateCampaignSchema = z.object({
  id: z.number().int().positive("ID is required"),
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  dailyLimit: z.number().int().positive().optional(),
  qualityThreshold: z.number().int().min(0).max(100).optional(),
  autopilot: z.boolean().optional(),
  defaultTone: z.string().optional(),
  strategy: z.enum(["web_design", "seo_visibility"]).optional(),
  agencyProfileId: z.number().int().positive().nullable().optional(),
  channels: z.array(z.enum(["email", "whatsapp"])).min(1).optional(),
  status: z.enum(["active", "paused", "archived"]).optional(),
});
