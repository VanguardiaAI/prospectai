import { getSetting } from "@/db";

interface LeadData {
  id: number;
  name: string;
  email?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
  website?: string | null;
  city?: string | null;
  category?: string | null;
  status: string;
  opportunityScore?: number | null;
}

export async function triggerCrmWebhook(lead: LeadData, event: string): Promise<void> {
  const webhookUrl = getSetting("crm_webhook_url");
  const triggerOn = getSetting("crm_webhook_on") || "replied";

  if (!webhookUrl) return;

  const triggers = triggerOn.split(",").map((s) => s.trim());
  if (!triggers.includes(event)) return;

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        lead: {
          id: lead.id,
          name: lead.name,
          email: lead.contactEmail || lead.email,
          phone: lead.phone,
          website: lead.website,
          city: lead.city,
          category: lead.category,
          status: lead.status,
          opportunityScore: lead.opportunityScore,
        },
      }),
    });
  } catch {
    // Silently fail — don't block the main flow
  }
}
