import { NextResponse } from "next/server";
import { db } from "@/db";
import { leads, emails, whatsappMessages } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { handleServiceError } from "@/services/api-handler";
import { isOnboardingComplete } from "@/services/agency-profile.service";
import { listCampaigns, getChannelsInUse } from "@/services/campaign.service";
import { checkEmailConfig } from "@/mcp/helpers/validators";
import { isWhatsAppReady } from "@/lib/whatsapp-client";

// State the chatbot shortcuts render against. Tells the UI (and indirectly the
// user) what's done, what's available, and what's still missing — including the
// channel-gated service warnings (only flag email/WhatsApp when a campaign uses it).
export async function GET() {
  try {
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

    return NextResponse.json({
      profile: { configured: profileConfigured },
      campaigns: { count: campaignCount },
      channelsInUse,
      leads: { count: leadCount },
      drafts: { pending: draftEmails + draftWa },
      services: {
        email: { configured: emailConfigured, required: channelsInUse.email },
        whatsapp: { configured: whatsappConfigured, required: channelsInUse.whatsapp },
      },
    });
  } catch (err) {
    return handleServiceError(err);
  }
}
