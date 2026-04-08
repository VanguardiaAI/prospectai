import { z } from "zod";

const sequenceStepSchema = z.object({
  channel: z.enum(["email", "whatsapp"]),
  delayDays: z.number().int().positive(),
  tone: z.string().min(1),
  customInstructions: z.string().optional(),
  enabled: z.boolean(),
});

export const saveStepsSchema = z.object({
  action: z.literal("save_steps"),
  campaignId: z.number().int().positive(),
  steps: z.array(sequenceStepSchema).min(1),
});

export const enrollLeadsSchema = z.object({
  action: z.literal("enroll"),
  campaignId: z.number().int().positive(),
  leadIds: z.array(z.number().int().positive()).min(1),
});

export const pauseResumeSchema = z.object({
  action: z.enum(["pause", "resume"]),
  enrollmentId: z.number().int().positive(),
});

export const stopSchema = z.object({
  action: z.literal("stop"),
  enrollmentId: z.number().int().positive(),
});

export const sequencePostSchema = z.union([saveStepsSchema, enrollLeadsSchema, pauseResumeSchema, stopSchema]);
