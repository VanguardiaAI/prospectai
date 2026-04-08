import { z } from "zod";

export const executePhaseSchema = z.object({
  phase: z.enum(["search", "analysis", "generation", "sending", "engagement"]),
  keyword: z.string().min(1).optional(),
});
