import { z } from "zod";

export const createDomainSchema = z.object({
  domain: z.string().min(1, "Domain is required"),
  fromEmail: z.string().email("Valid email required"),
  fromName: z.string().min(1, "From name is required"),
  dailyLimit: z.number().int().positive().optional(),
  resendApiKey: z.string().optional(),
});

export const updateDomainSchema = z.object({
  id: z.number().int().positive("ID is required"),
  domain: z.string().optional(),
  fromEmail: z.string().email().optional(),
  fromName: z.string().optional(),
  dailyLimit: z.number().int().positive().optional(),
  status: z.enum(["active", "warming", "paused"]).optional(),
  resendApiKey: z.string().optional(),
  warmupDay: z.number().int().min(0).optional(),
  warmupStartLimit: z.number().int().positive().optional(),
  warmupIncrement: z.number().int().positive().optional(),
});
