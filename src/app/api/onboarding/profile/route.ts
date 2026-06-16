import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validations";
import * as agencyProfileService from "@/services/agency-profile.service";
import { handleServiceError } from "@/services/api-handler";

const upsertSchema = z.object({
  name: z.string().nullable().optional(),
  url: z.string().nullable().optional(),
  description: z.string().nullable().optional(),
  tagline: z.string().nullable().optional(),
  ownerName: z.string().nullable().optional(),
  ownerRole: z.string().nullable().optional(),
  contactEmail: z.string().nullable().optional(),
  contactPhone: z.string().nullable().optional(),
  services: z.array(z.string()).optional(),
  customServices: z.array(z.object({
    label: z.string(),
    description: z.string(),
  })).optional(),
  city: z.string().nullable().optional(),
  country: z.string().nullable().optional(),
  valueProps: z.array(z.string()).optional(),
  caseStudies: z.array(z.object({
    client: z.string(),
    result: z.string(),
    snippet: z.string().optional(),
  })).optional(),
  source: z.enum(["url", "manual", "skipped"]).optional(),
  sourceUrl: z.string().nullable().optional(),
  extractedAt: z.string().nullable().optional(),
  markComplete: z.boolean().optional(),
});

export async function GET() {
  try {
    const profile = agencyProfileService.getAgencyProfile();
    return NextResponse.json({
      profile,
      onboardingComplete: Boolean(profile?.completedAt),
    });
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(upsertSchema, body);
  if (!v.success) return v.response;

  try {
    const { markComplete, ...data } = v.data;
    const updated = agencyProfileService.upsertAgencyProfile(data);
    if (markComplete) {
      const completed = agencyProfileService.markOnboardingComplete(data.source ?? "manual");
      return NextResponse.json({ profile: completed, onboardingComplete: true });
    }
    return NextResponse.json({ profile: updated, onboardingComplete: Boolean(updated.completedAt) });
  } catch (err) {
    return handleServiceError(err);
  }
}

export async function DELETE() {
  try {
    agencyProfileService.resetAgencyProfile();
    return NextResponse.json({ ok: true });
  } catch (err) {
    return handleServiceError(err);
  }
}
