import { NextRequest, NextResponse } from "next/server";
import { sendEmail } from "@/lib/resend-client";
import { db, getSetting } from "@/db";
import { emails } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function POST(request: NextRequest) {
  try {
    const { emailId } = await request.json();
    if (!emailId) {
      return NextResponse.json({ success: false, error: "emailId requerido" }, { status: 400 });
    }

    const testTo = getSetting("reply_to_email") || getSetting("from_email");
    if (!testTo) {
      return NextResponse.json({ success: false, error: "Configura reply_to_email o from_email en Settings" }, { status: 400 });
    }

    const [emailRow] = await db.select().from(emails).where(eq(emails.id, emailId)).limit(1);
    if (!emailRow) {
      return NextResponse.json({ success: false, error: "Email no encontrado" }, { status: 404 });
    }

    const fromEmail = getSetting("from_email") || "noreply@example.com";
    const fromName = getSetting("from_name") || "ProspectAI";

    const result = await sendEmail({
      to: testTo,
      from: `${fromName} <${fromEmail}>`,
      subject: `[TEST] ${emailRow.subject}`,
      html: emailRow.bodyHtml,
      text: emailRow.bodyText,
      replyTo: testTo,
    });

    if (result.success) {
      return NextResponse.json({ success: true, sentTo: testTo });
    }
    return NextResponse.json({ success: false, error: result.error }, { status: 500 });
  } catch (err) {
    return NextResponse.json({ success: false, error: err instanceof Error ? err.message : "Error" }, { status: 500 });
  }
}
