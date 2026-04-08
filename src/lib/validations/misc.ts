import { z } from "zod";

export const updateNotesSchema = z.object({
  leadId: z.number().int().positive("leadId is required"),
  notes: z.string(),
});

export const schedulerActionSchema = z.object({
  action: z.enum(["start", "stop"]),
});
