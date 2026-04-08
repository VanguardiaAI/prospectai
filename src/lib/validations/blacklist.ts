import { z } from "zod";

export const createBlacklistSchema = z.object({
  type: z.enum(["domain", "email", "business"]),
  value: z.string().min(1, "Value is required"),
  reason: z.string().optional(),
});
