import { NextRequest, NextResponse } from "next/server";
import { Webhook } from "svix";
import { db } from "@/db";
import { emails, leads, sequenceEnrollments, replies, abResults } from "@/db/schema";
import { eq, and } from "drizzle-orm";
import { logActivity } from "@/lib/activity";
import { prioritizeLeadOnReply } from "@/lib/lead-prioritization";

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();

    // Validate Resend webhook signature if secret is configured
    const secret = process.env.RESEND_WEBHOOK_SECRET;
    if (secret) {
      const wh = new Webhook(secret);
      try {
        wh.verify(rawBody, {
          "svix-id": req.headers.get("svix-id") ?? "",
          "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
          "svix-signature": req.headers.get("svix-signature") ?? "",
        });
      } catch {
        return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
      }
    }

    const body = JSON.parse(rawBody);
    const { type, data } = body;

    if (!data?.email_id) {
      return NextResponse.json({ received: true });
    }

    // Find the email by resend ID
    const email = db.select().from(emails)
      .where(eq(emails.resendId, data.email_id))
      .get();

    if (!email) {
      return NextResponse.json({ received: true });
    }

    switch (type) {
      case "email.opened": {
        if (!email.openedAt) {
          db.update(emails)
            .set({ openedAt: new Date().toISOString() })
            .where(eq(emails.id, email.id))
            .run();

          db.update(abResults)
            .set({ opened: true })
            .where(eq(abResults.emailId, email.id))
            .run();
        }
        break;
      }

      case "email.clicked": {
        if (!email.clickedAt) {
          db.update(emails)
            .set({ clickedAt: new Date().toISOString() })
            .where(eq(emails.id, email.id))
            .run();
          if (!email.openedAt) {
            db.update(emails)
              .set({ openedAt: new Date().toISOString() })
              .where(eq(emails.id, email.id))
              .run();
          }
          db.update(abResults)
            .set({ clicked: true, opened: true })
            .where(eq(abResults.emailId, email.id))
            .run();
        }
        break;
      }

      case "email.replied": {
        // Record reply
        db.insert(replies).values({
          leadId: email.leadId,
          campaignId: email.campaignId,
          channel: "email",
          fromAddress: email.toEmail,
          body: data.body || null,
        }).run();

        // Update A/B results
        db.update(abResults)
          .set({ replied: true })
          .where(eq(abResults.emailId, email.id))
          .run();

        // Stop active sequences for this lead
        db.update(sequenceEnrollments)
          .set({ status: "replied", completedAt: new Date().toISOString() })
          .where(and(
            eq(sequenceEnrollments.leadId, email.leadId),
            eq(sequenceEnrollments.status, "active")
          ))
          .run();

        // Prioritize lead: set status to "replied", boost opportunityScore
        prioritizeLeadOnReply(email.leadId);

        logActivity("email_sent", `Respuesta recibida de ${email.toEmail}`, {
          leadId: email.leadId,
          campaignId: email.campaignId ?? undefined,
          metadata: { event: "reply" },
        });

        // CRM webhook trigger
        const { triggerCrmWebhook } = await import("@/lib/crm-webhook");
        const lead = db.select().from(leads).where(eq(leads.id, email.leadId)).get();
        if (lead) {
          await triggerCrmWebhook(lead, "replied");
        }
        break;
      }

      case "email.bounced":
      case "email.complained": {
        db.update(emails)
          .set({ status: "failed" })
          .where(eq(emails.id, email.id))
          .run();

        logActivity("email_failed", `Email ${type === "email.bounced" ? "rebotado" : "reportado"}: ${email.toEmail}`, {
          leadId: email.leadId,
        });
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
