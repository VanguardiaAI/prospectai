import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity";

/**
 * Automatically prioritize a lead when they reply via any channel.
 * - Sets status to "replied" (unless already replied)
 * - Boosts opportunityScore by 20 (capped at 100)
 * - Logs a prioritization activity entry
 */
export function prioritizeLeadOnReply(leadId: number): void {
  const lead = db.select().from(leads).where(eq(leads.id, leadId)).get();
  if (!lead) return;

  // Skip if already prioritized from a previous reply
  if (lead.status === "replied") return;

  const currentScore = lead.opportunityScore ?? 0;
  const boostedScore = Math.min(currentScore + 20, 100);

  db.update(leads)
    .set({
      status: "replied",
      opportunityScore: boostedScore,
    })
    .where(eq(leads.id, leadId))
    .run();

  logActivity("lead_prioritized", "Lead respondio - priorizado automaticamente", {
    leadId,
    campaignId: lead.campaignId ?? undefined,
    metadata: {
      previousStatus: lead.status,
      previousScore: currentScore,
      newScore: boostedScore,
    },
    messageKey: "activityLog.campaignUpdated",
    messageVars: { name: lead.name ?? "" },
  });
}
