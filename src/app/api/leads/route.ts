import { NextRequest, NextResponse } from "next/server";
import { validateBody, bulkUpdateLeadsSchema, updateLeadSchema, deleteLeadSchema } from "@/lib/validations";
import { searchLeads, updateLead, bulkUpdateLeads, deleteLead, bulkDeleteLeads, getLeadFacets } from "@/services/lead.service";
import { handleServiceError } from "@/services/api-handler";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const campaignId = searchParams.get("campaignId");
    const city = searchParams.get("city");
    const status = searchParams.get("status") || undefined;
    const source = searchParams.get("source") || undefined;
    const tags = searchParams.get("tags") || undefined;
    const maxQuality = searchParams.get("maxQuality");
    const search = searchParams.get("search") || undefined;
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");

    const result = searchLeads({
      campaignId: campaignId ? Number(campaignId) : undefined,
      city: city || undefined,
      status,
      source,
      tags,
      maxQuality: maxQuality ? Number(maxQuality) : undefined,
      search,
      page,
      limit,
    });

    // Distinct cities / sources / tags for the filter dropdowns.
    const facets = getLeadFacets();

    return NextResponse.json({ ...result, ...facets });
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();

    // Bulk update: { bulkIds: number[], status?: string, campaignId?: number }
    if (body.bulkIds) {
      const v = validateBody(bulkUpdateLeadsSchema, body);
      if (!v.success) return v.response;

      const result = bulkUpdateLeads(v.data.bulkIds, {
        status: v.data.status,
        campaignId: v.data.campaignId,
      });
      return NextResponse.json(result);
    }

    // Single update
    const v = validateBody(updateLeadSchema, body);
    if (!v.success) return v.response;

    const result = updateLead(v.data.id, {
      contactEmail: v.data.contactEmail,
      notes: v.data.notes,
      status: v.data.status,
      campaignId: v.data.campaignId,
      tags: v.data.tags,
    });
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json();

    const v = validateBody(deleteLeadSchema, body);
    if (!v.success) return v.response;

    if ("bulkIds" in v.data) {
      const result = bulkDeleteLeads(v.data.bulkIds);
      return NextResponse.json(result);
    }

    const result = deleteLead(v.data.id);
    return NextResponse.json(result);
  } catch (err) {
    return handleServiceError(err);
  }
}
