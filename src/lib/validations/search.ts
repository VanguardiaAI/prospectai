import { z } from "zod";

export const startSearchSchema = z.object({
  keyword: z.string().min(1, "Keyword is required"),
  campaignId: z.number().int().positive().optional(),
  maxDepth: z.number().int().positive().optional(),
});

export const importSearchResultsSchema = z.object({
  selectedIndices: z.array(z.number().int().min(0)).optional(),
  campaignId: z.number().int().positive().optional(),
});
