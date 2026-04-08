import { db } from "@/db";
import { sequenceSteps, sequenceEnrollments } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { ValidationError, NotFoundError } from "./errors";

// ─── Types ──────────────────────────────────────────────────────────

export interface StepInput {
  channel: string;
  delayDays: number;
  tone: string;
  customInstructions?: string;
  enabled: boolean;
}

// ─── Service Functions ──────────────────────────────────────────────

export function getSequenceSteps(campaignId: number) {
  const steps = db.select().from(sequenceSteps)
    .where(eq(sequenceSteps.campaignId, campaignId))
    .orderBy(sequenceSteps.stepNumber)
    .all();

  const enrollments = db.select().from(sequenceEnrollments)
    .where(eq(sequenceEnrollments.campaignId, campaignId))
    .all();

  return { steps, enrollments };
}

export function saveSteps(campaignId: number, steps: StepInput[]) {
  // Use a transaction: delete old steps then insert new ones
  db.transaction((tx) => {
    tx.delete(sequenceSteps).where(eq(sequenceSteps.campaignId, campaignId)).run();

    for (let i = 0; i < steps.length; i++) {
      tx.insert(sequenceSteps).values({
        campaignId,
        stepNumber: i + 1,
        channel: steps[i].channel as "email" | "whatsapp",
        delayDays: steps[i].delayDays,
        tone: steps[i].tone,
        customInstructions: steps[i].customInstructions || null,
        enabled: steps[i].enabled,
      }).run();
    }
  });

  logActivity("campaign_change", `Secuencia actualizada para campaña #${campaignId} (${steps.length} pasos)`, {
    messageKey: "activityLog.campaignUpdated",
    messageVars: { name: `#${campaignId}` },
  });

  return { success: true, stepCount: steps.length };
}

export function enrollLeads(campaignId: number, leadIds: number[]) {
  const steps = db.select().from(sequenceSteps)
    .where(and(eq(sequenceSteps.campaignId, campaignId), eq(sequenceSteps.enabled, true)))
    .orderBy(sequenceSteps.stepNumber)
    .all();

  if (steps.length === 0) {
    throw new ValidationError("Campaign has no sequence steps");
  }

  let enrolled = 0;
  for (const leadId of leadIds) {
    // Check not already enrolled (dedup)
    const existing = db.select().from(sequenceEnrollments)
      .where(and(
        eq(sequenceEnrollments.leadId, leadId),
        eq(sequenceEnrollments.campaignId, campaignId),
        eq(sequenceEnrollments.status, "active"),
      ))
      .get();

    if (existing) continue;

    // Calculate first action time: now + first step delay
    const firstStep = steps[0];
    const nextAction = new Date();
    nextAction.setDate(nextAction.getDate() + firstStep.delayDays);

    db.insert(sequenceEnrollments).values({
      leadId,
      campaignId,
      currentStep: 1,
      status: "active",
      nextActionAt: nextAction.toISOString(),
    }).run();

    enrolled++;
  }

  logActivity("campaign_change", `${enrolled} leads enrolados en secuencia de campaña #${campaignId}`, {
    messageKey: "activityLog.campaignUpdated",
    messageVars: { name: `#${campaignId}` },
  });

  return { success: true, enrolled };
}

export function pauseEnrollment(enrollmentId: number) {
  const enrollment = db.select().from(sequenceEnrollments).where(eq(sequenceEnrollments.id, enrollmentId)).get();
  if (!enrollment) throw new NotFoundError("Enrollment", enrollmentId);

  db.update(sequenceEnrollments)
    .set({ status: "paused" as "active" | "paused" })
    .where(eq(sequenceEnrollments.id, enrollmentId))
    .run();

  return { success: true };
}

export function resumeEnrollment(enrollmentId: number) {
  const enrollment = db.select().from(sequenceEnrollments).where(eq(sequenceEnrollments.id, enrollmentId)).get();
  if (!enrollment) throw new NotFoundError("Enrollment", enrollmentId);

  db.update(sequenceEnrollments)
    .set({ status: "active" as "active" | "paused" })
    .where(eq(sequenceEnrollments.id, enrollmentId))
    .run();

  return { success: true };
}

export function stopEnrollment(enrollmentId: number) {
  const enrollment = db.select().from(sequenceEnrollments).where(eq(sequenceEnrollments.id, enrollmentId)).get();
  if (!enrollment) throw new NotFoundError("Enrollment", enrollmentId);

  db.update(sequenceEnrollments)
    .set({ status: "completed", completedAt: new Date().toISOString() })
    .where(eq(sequenceEnrollments.id, enrollmentId))
    .run();

  return { success: true };
}
