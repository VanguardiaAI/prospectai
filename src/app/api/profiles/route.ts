import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validations";
import * as agencyProfileService from "@/services/agency-profile.service";
import { handleServiceError } from "@/services/api-handler";

const profileFields = {
  label: z.string().nullable().optional(),
  strategy: z.enum(["web_design", "seo_visibility"]).optional(),
  isDefault: z.boolean().optional(),
  name: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  tagline: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  ownerRole: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  services: z.array(z.string()).optional(),
  customServices: z.array(z.object({ label: z.string(), description: z.string() })).optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  valueProps: z.array(z.string()).optional(),
  caseStudies: z.array(z.object({
    client: z.string(),
    result: z.string(),
    snippet: z.string().optional(),
  })).optional(),
};

const createSchema = z.object(profileFields);
const updateSchema = z.object({ id: z.number().int().positive(), ...profileFields });

export async function GET() {
  try {
    const profiles = agencyProfileService.listAgencyProfiles();
    const defaultProfile = agencyProfileService.getDefaultAgencyProfile();
    return NextResponse.json({ profiles, defaultProfileId: defaultProfile?.id ?? null });
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(createSchema, body);
  if (!v.success) return v.response;

  try {
    const profile = agencyProfileService.createAgencyProfile(v.data);
    return NextResponse.json({ profile });
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(updateSchema, body);
  if (!v.success) return v.response;

  try {
    const { id, ...data } = v.data;
    const profile = agencyProfileService.updateAgencyProfile(id, data);
    return NextResponse.json({ profile });
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Valid id is required" }, { status: 400 });
  }
  try {
    agencyProfileService.deleteAgencyProfile(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleServiceError(err);
  }
}
