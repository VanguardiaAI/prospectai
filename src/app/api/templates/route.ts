import { NextRequest, NextResponse } from "next/server";
import { validateBody, createTemplateFromEmailSchema, createTemplateSchema, updateTemplateSchema } from "@/lib/validations";
import * as templateService from "@/services/template.service";
import { handleServiceError } from "@/services/api-handler";

// GET: List all templates
export async function GET() {
  try {
    const data = templateService.listTemplates();
    return NextResponse.json(data);
  } catch (err) {
    return handleServiceError(err);
  }
}

// POST: Create new template (or save from existing email)
export async function POST(req: NextRequest) {
  const body = await req.json();

  // Save from existing email
  if (body.fromEmailId) {
    const v = validateBody(createTemplateFromEmailSchema, body);
    if (!v.success) return v.response;

    try {
      const result = templateService.createTemplateFromEmail(v.data.fromEmailId, {
        name: v.data.name,
        category: v.data.category,
      });
      return NextResponse.json({ id: result.id });
    } catch (err) {
      return handleServiceError(err);
    }
  }

  // Create from scratch
  const v = validateBody(createTemplateSchema, body);
  if (!v.success) return v.response;

  const { name, channel, category, subjectTemplate, bodyHtmlTemplate, bodyTextTemplate, variables } = v.data;

  if (!subjectTemplate || !bodyHtmlTemplate || !bodyTextTemplate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  try {
    const result = templateService.createTemplate({
      name,
      channel,
      category,
      subjectTemplate,
      bodyHtmlTemplate,
      bodyTextTemplate,
      variables,
    });
    return NextResponse.json({ id: result.id });
  } catch (err) {
    return handleServiceError(err);
  }
}

// PUT: Update template
export async function PUT(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(updateTemplateSchema, body);
  if (!v.success) return v.response;

  const { id, ...updates } = v.data;

  try {
    const result = templateService.updateTemplate(id, updates);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}

// DELETE: Remove template
export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = parseInt(searchParams.get("id") || "0");

  if (!id) {
    return NextResponse.json({ error: "Missing template id" }, { status: 400 });
  }

  try {
    const result = templateService.deleteTemplate(id);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
