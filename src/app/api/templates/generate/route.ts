import { NextRequest, NextResponse } from "next/server";
import { generateEmailTemplate, generateWhatsAppTemplate } from "@/lib/gemini";
import { validateBody, generateTemplateSchema } from "@/lib/validations";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(generateTemplateSchema, body);
  if (!v.success) return v.response;

  const { channel, industry, purpose, tone, customInstructions } = v.data;

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
