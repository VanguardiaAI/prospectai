import { NextRequest } from "next/server";
import { db } from "@/db";
import { emails, abResults } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity";

// 1x1 transparent GIF pixel
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const emailId = parseInt(searchParams.get("id") || "0");

  if (emailId > 0) {
    const email = db.select().from(emails).where(eq(emails.id, emailId)).get();

    if (email && !email.openedAt) {
      db.update(emails)
        .set({ openedAt: new Date().toISOString() })
        .where(eq(emails.id, emailId))
        .run();

      // Update A/B result if exists
      db.update(abResults)
        .set({ opened: true })
        .where(eq(abResults.emailId, emailId))
        .run();

      logActivity("email_sent", `Email abierto por ${email.toEmail}`, {
        leadId: email.leadId,
        campaignId: email.campaignId ?? undefined,
        metadata: { event: "open" },
        messageKey: "activityLog.emailSentTo",
        messageVars: { email: email.toEmail },
      });
    }
  }

  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}
