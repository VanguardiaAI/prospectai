import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { emails, whatsappMessages, leads } from "@/db/schema";
import { eq, and, inArray } from "drizzle-orm";
import { findPriorContacts } from "@/lib/contact-history";
import { logActivity } from "@/lib/activity";

// GET /api/contact-history?leadIds=1,2,3
// Returns prior outreach to the same company (other leads/campaigns), per lead.
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const raw = searchParams.get("leadIds") || "";
  const ids = raw.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => Number.isFinite(n)).slice(0, 300);

  const history: Record<number, ReturnType<typeof findPriorContacts>> = {};
  for (const id of ids) {
    const prior = findPriorContacts(id);
    if (prior.length) history[id] = prior;
  }
  return NextResponse.json({ history });
}

// POST /api/contact-history  { leadId, action: "ack" }
// Conscious override: acknowledge the duplicate for this company and let its
// pending outreach proceed (approve drafts; held fallbacks stay held but acked).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const leadId = Number(body?.leadId);
  if (!Number.isFinite(leadId) || body?.action !== "ack") {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const pending = ["draft", "approved", "held"] as const;

  db.update(emails).set({ dupAck: true, updatedAt: now })
    .where(and(eq(emails.leadId, leadId), inArray(emails.status, [...pending]))).run();
  db.update(whatsappMessages).set({ dupAck: true, updatedAt: now })
    .where(and(eq(whatsappMessages.leadId, leadId), inArray(whatsappMessages.status, [...pending]))).run();

  // Proceed to send: approve any draft (the primary). Held fallbacks keep waiting
  // on the email-first timing, but are now cleared of the duplicate hold.
  db.update(emails).set({ status: "approved", updatedAt: now })
    .where(and(eq(emails.leadId, leadId), eq(emails.status, "draft"))).run();
  db.update(whatsappMessages).set({ status: "approved", updatedAt: now })
    .where(and(eq(whatsappMessages.leadId, leadId), eq(whatsappMessages.status, "draft"))).run();

  const lead = db.select({ name: leads.name, campaignId: leads.campaignId }).from(leads).where(eq(leads.id, leadId)).get();
  logActivity("email_approved", `Re-contacto consciente aprobado para ${lead?.name ?? `lead #${leadId}`} (empresa ya contactada)`, {
    leadId,
    campaignId: lead?.campaignId ?? undefined,
    messageKey: "activityLog.emailApproved",
  });

  return NextResponse.json({ success: true });
}
