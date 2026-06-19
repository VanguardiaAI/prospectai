// Shared assistant state snapshot: profile/campaigns/leads/drafts + channel-gated
// service readiness. Single source of truth for the chat shortcuts guidance route
// and the proactive nudge route (so the two never drift).

import { db } from "@/db";
import { leads, emails, whatsappMessages } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { isOnboardingComplete } from "@/services/agency-profile.service";
import { listCampaigns, getChannelsInUse } from "@/services/campaign.service";
import { checkEmailConfig } from "@/mcp/helpers/validators";
import { isWhatsAppReady } from "@/lib/whatsapp-client";

export interface AssistantState {
  profile: { configured: boolean };
  campaigns: { count: number };
  channelsInUse: { email: boolean; whatsapp: boolean };
  leads: { count: number };
  drafts: { pending: number };
  services: {
    email: { configured: boolean; required: boolean };
    whatsapp: { configured: boolean; required: boolean };
  };
}

export function getAssistantState(): AssistantState {
  const profileConfigured = isOnboardingComplete();
  const campaignCount = listCampaigns().length;
  const channelsInUse = getChannelsInUse();

  const leadCount =
    db.select({ count: sql<number>`count(*)` }).from(leads).get()?.count ?? 0;

  const draftEmails =
    db.select({ count: sql<number>`count(*)` })
      .from(emails)
      .where(eq(emails.status, "draft"))
      .get()?.count ?? 0;

  const draftWa =
    db.select({ count: sql<number>`count(*)` })
      .from(whatsappMessages)
      .where(eq(whatsappMessages.status, "draft"))
      .get()?.count ?? 0;

  const emailConfigured = checkEmailConfig().ok;
  const whatsappConfigured = isWhatsAppReady();

  return {
    profile: { configured: profileConfigured },
    campaigns: { count: campaignCount },
    channelsInUse,
    leads: { count: leadCount },
    drafts: { pending: draftEmails + draftWa },
    services: {
      email: { configured: emailConfigured, required: channelsInUse.email },
      whatsapp: { configured: whatsappConfigured, required: channelsInUse.whatsapp },
    },
  };
}

/**
 * Stable fingerprint of (page + state). The proactive route skips regenerating a
 * nudge while this is unchanged — nothing meaningful moved, so don't repeat.
 */
export function stateSignature(path: string, s: AssistantState): string {
  return [
    path,
    s.profile.configured ? "p1" : "p0",
    `c${s.campaigns.count}`,
    `l${s.leads.count}`,
    `d${s.drafts.pending}`,
    s.services.email.configured ? "e1" : "e0",
    s.services.whatsapp.configured ? "w1" : "w0",
  ].join("|");
}
