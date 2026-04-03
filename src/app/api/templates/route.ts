import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { emailTemplates, emails } from "@/db/schema";
import { eq, sql, and, isNotNull } from "drizzle-orm";

// GET: List all templates
export async function GET() {
  const templates = db.select().from(emailTemplates).all();

  return NextResponse.json(templates);
}

// POST: Create new template (or save from existing email)
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Save from existing email
  if (body.fromEmailId) {
    const email = db.select().from(emails).where(eq(emails.id, body.fromEmailId)).get();
    if (!email) {
      return NextResponse.json({ error: "Email not found" }, { status: 404 });
    }

    // Extract variables from the template ({{variable_name}} pattern)
    const variableMatches = email.bodyHtml.match(/\{\{(\w+)\}\}/g) || [];
    const variables = [...new Set(variableMatches.map((m) => m.replace(/\{\{|\}\}/g, "")))];

    const result = db.insert(emailTemplates).values({
      name: body.name || `Template de ${email.subject}`,
      category: body.category || null,
      subjectTemplate: email.subject,
      bodyHtmlTemplate: email.bodyHtml,
      bodyTextTemplate: email.bodyText,
      variables: JSON.stringify(variables),
    }).run();

    return NextResponse.json({ id: result.lastInsertRowid });
  }

  // Create from scratch
  const { name, channel, category, subjectTemplate, bodyHtmlTemplate, bodyTextTemplate, variables } = body;

  if (!name || !subjectTemplate || !bodyHtmlTemplate || !bodyTextTemplate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const result = db.insert(emailTemplates).values({
    name,
    channel: channel || "email",
    category: category || null,
    subjectTemplate,
    bodyHtmlTemplate,
    bodyTextTemplate,
    variables: JSON.stringify(variables || []),
  }).run();

  return NextResponse.json({ id: result.lastInsertRowid });
}

// PUT: Update template
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const { id, ...updates } = body;

  if (!id) {
    return NextResponse.json({ error: "Missing template id" }, { status: 400 });
  }

  const allowed: Record<string, unknown> = {};
  if (updates.name !== undefined) allowed.name = updates.name;
  if (updates.channel !== undefined) allowed.channel = updates.channel;
  if (updates.category !== undefined) allowed.category = updates.category;
  if (updates.subjectTemplate !== undefined) allowed.subjectTemplate = updates.subjectTemplate;
  if (updates.bodyHtmlTemplate !== undefined) allowed.bodyHtmlTemplate = updates.bodyHtmlTemplate;
  if (updates.bodyTextTemplate !== undefined) allowed.bodyTextTemplate = updates.bodyTextTemplate;
  if (updates.variables !== undefined) allowed.variables = JSON.stringify(updates.variables);

  db.update(emailTemplates).set(allowed).where(eq(emailTemplates.id, id)).run();

  return NextResponse.json({ success: true });
}

// DELETE: Remove template
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id") || "0");

  if (!id) {
    return NextResponse.json({ error: "Missing template id" }, { status: 400 });
  }

  db.delete(emailTemplates).where(eq(emailTemplates.id, id)).run();

  return NextResponse.json({ success: true });
}
