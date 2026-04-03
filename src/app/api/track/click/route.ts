import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { emails, abResults } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const emailId = parseInt(searchParams.get("id") || "0");
  const targetUrl = searchParams.get("url");

  if (emailId > 0) {
    const email = db.select().from(emails).where(eq(emails.id, emailId)).get();

    if (email && !email.clickedAt) {
      db.update(emails)
        .set({ clickedAt: new Date().toISOString() })
        .where(eq(emails.id, emailId))
        .run();

      // Also mark as opened if not already
      if (!email.openedAt) {
        db.update(emails)
          .set({ openedAt: new Date().toISOString() })
          .where(eq(emails.id, emailId))
          .run();
      }

      // Update A/B result if exists
      db.update(abResults)
        .set({ clicked: true, opened: true })
        .where(eq(abResults.emailId, emailId))
        .run();

      logActivity("email_sent", `Click en email de ${email.toEmail}`, {
        leadId: email.leadId,
        campaignId: email.campaignId ?? undefined,
        metadata: { event: "click", url: targetUrl },
      });
    }
  }

  if (targetUrl) {
    return NextResponse.redirect(targetUrl, 302);
  }

  return NextResponse.json({ error: "Missing url parameter" }, { status: 400 });
}
