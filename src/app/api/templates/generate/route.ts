import { NextRequest, NextResponse } from "next/server";
import { generateEmailTemplate, generateWhatsAppTemplate } from "@/lib/gemini";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { channel, industry, purpose, tone, customInstructions } = body;

  if (!channel || !industry || !purpose || !tone) {
    return NextResponse.json(
      { error: "Missing required fields: channel, industry, purpose, tone" },
      { status: 400 }
    );
  }

  if (!["email", "whatsapp"].includes(channel)) {
    return NextResponse.json({ error: "Invalid channel" }, { status: 400 });
  }

  if (!["initial", "follow_up", "breakup"].includes(purpose)) {
    return NextResponse.json({ error: "Invalid purpose" }, { status: 400 });
  }

  try {
    if (channel === "email") {
      const result = await generateEmailTemplate(industry, purpose, tone, customInstructions);
      return NextResponse.json({
        channel: "email",
        name: result.name,
        subject: result.subject,
        bodyHtml: result.bodyHtml,
        bodyText: result.bodyText,
        variables: result.variables,
      });
    } else {
      const result = await generateWhatsAppTemplate(industry, purpose, tone, customInstructions);
      return NextResponse.json({
        channel: "whatsapp",
        name: result.name,
        message: result.message,
        variables: result.variables,
      });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { error: `Failed to generate template: ${message}` },
      { status: 500 }
    );
  }
}
