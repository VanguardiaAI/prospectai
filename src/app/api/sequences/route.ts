import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { sequenceSteps, sequenceEnrollments, leads, campaigns } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logActivity } from "@/lib/activity";

// GET: List sequence steps for a campaign
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");

  if (!campaignId) {
    return NextResponse.json({ error: "campaignId required" }, { status: 400 });
  }

  const steps = db.select().from(sequenceSteps)
    .where(eq(sequenceSteps.campaignId, Number(campaignId)))
    .orderBy(sequenceSteps.stepNumber)
    .all();

  const enrollments = db.select().from(sequenceEnrollments)
    .where(eq(sequenceEnrollments.campaignId, Number(campaignId)))
    .all();

  return NextResponse.json({ steps, enrollments });
}

// POST: Create/update sequence steps for a campaign OR enroll leads
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { action } = body;

  if (action === "save_steps") {
    // Save sequence steps for a campaign
    const { campaignId, steps } = body as {
      campaignId: number;
      steps: { channel: string; delayDays: number; tone: string; customInstructions?: string; enabled: boolean }[];
    };

    // Delete existing steps
    db.delete(sequenceSteps).where(eq(sequenceSteps.campaignId, campaignId)).run();

    // Insert new steps
    for (let i = 0; i < steps.length; i++) {
      db.insert(sequenceSteps).values({
        campaignId,
        stepNumber: i + 1,
        channel: steps[i].channel as "email" | "whatsapp",
        delayDays: steps[i].delayDays,
        tone: steps[i].tone,
        customInstructions: steps[i].customInstructions || null,
        enabled: steps[i].enabled,
      }).run();
    }

    logActivity("campaign_change", `Secuencia actualizada para campaña #${campaignId} (${steps.length} pasos)`);
    return NextResponse.json({ success: true, stepCount: steps.length });
  }

  if (action === "enroll") {
    // Enroll leads into sequence
    const { campaignId, leadIds } = body as { campaignId: number; leadIds: number[] };

    const steps = db.select().from(sequenceSteps)
      .where(and(eq(sequenceSteps.campaignId, campaignId), eq(sequenceSteps.enabled, true)))
      .orderBy(sequenceSteps.stepNumber)
      .all();

    if (steps.length === 0) {
      return NextResponse.json({ error: "Campaign has no sequence steps" }, { status: 400 });
    }

    let enrolled = 0;
    for (const leadId of leadIds) {
      // Check not already enrolled
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

    logActivity("campaign_change", `${enrolled} leads enrolados en secuencia de campaña #${campaignId}`);
    return NextResponse.json({ success: true, enrolled });
  }

  if (action === "pause" || action === "resume") {
    const { enrollmentId } = body;
    const newStatus = action === "pause" ? "paused" : "active";
    db.update(sequenceEnrollments)
      .set({ status: newStatus as "active" | "paused" })
      .where(eq(sequenceEnrollments.id, enrollmentId))
      .run();
    return NextResponse.json({ success: true });
  }

  if (action === "stop") {
    const { enrollmentId } = body;
    db.update(sequenceEnrollments)
      .set({ status: "completed", completedAt: new Date().toISOString() })
      .where(eq(sequenceEnrollments.id, enrollmentId))
      .run();
    return NextResponse.json({ success: true });
  }

  return NextResponse.json({ error: "Unknown action" }, { status: 400 });
}
