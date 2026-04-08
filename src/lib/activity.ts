import { db } from "@/db";
import { activityLog } from "@/db/schema";

type ActivityType = "import" | "scrape" | "analyze" | "email_generated" | "email_approved" | "email_rejected" | "email_sent" | "email_failed" | "wa_generated" | "wa_approved" | "wa_rejected" | "wa_sent" | "wa_failed" | "blacklist" | "setting_change" | "campaign_change" | "lead_prioritized" | "error";

export function logActivity(
  type: ActivityType,
  message: string,
  opts?: {
    leadId?: number;
    campaignId?: number;
    metadata?: Record<string, unknown>;
    messageKey?: string;
    messageVars?: Record<string, string | number>;
  }
) {
  const meta = { ...opts?.metadata } as Record<string, unknown>;
  if (opts?.messageKey) {
    meta._i18nKey = opts.messageKey;
    if (opts.messageVars) meta._i18nVars = opts.messageVars;
  }
  db.insert(activityLog).values({
    type,
    message,
    leadId: opts?.leadId,
    campaignId: opts?.campaignId,
    metadata: Object.keys(meta).length > 0 ? JSON.stringify(meta) : null,
  }).run();
}
