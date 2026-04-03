import { db } from "@/db";
import { activityLog } from "@/db/schema";

type ActivityType = "import" | "scrape" | "analyze" | "email_generated" | "email_approved" | "email_rejected" | "email_sent" | "email_failed" | "wa_generated" | "wa_approved" | "wa_rejected" | "wa_sent" | "wa_failed" | "blacklist" | "setting_change" | "campaign_change" | "error";

export function logActivity(
  type: ActivityType,
  message: string,
  opts?: { leadId?: number; campaignId?: number; metadata?: Record<string, unknown> }
) {
  db.insert(activityLog).values({
    type,
    message,
    leadId: opts?.leadId,
    campaignId: opts?.campaignId,
    metadata: opts?.metadata ? JSON.stringify(opts.metadata) : null,
  }).run();
}
