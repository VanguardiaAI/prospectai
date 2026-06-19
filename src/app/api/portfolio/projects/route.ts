import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validations";
import {
  getPortfolioProjects,
  createPortfolioProject,
  createPortfolioProjects,
  updatePortfolioProject,
  deletePortfolioProject,
  type PortfolioProjectData,
} from "@/db/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Auth is enforced by src/proxy.ts.

const projectFields = {
  agencyProfileId: z.number().int().positive().nullable().optional(),
  title: z.string().min(1).max(200),
  client: z.string().nullable().optional(),
  sector: z.string().nullable().optional(),
  problem: z.string().nullable().optional(),
  solution: z.string().nullable().optional(),
  services: z.array(z.string()).optional(),
  stack: z.array(z.string()).optional(),
  deliverables: z.string().nullable().optional(),
  result: z.string().nullable().optional(),
  metric: z.string().nullable().optional(),
  testimonial: z.string().nullable().optional(),
  testimonialAuthor: z.string().nullable().optional(),
  projectUrl: z.string().nullable().optional(),
  durationLabel: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  highlight: z.boolean().optional(),
  source: z.enum(["scraped", "manual", "enriched"]).optional(),
  sourceUrl: z.string().nullable().optional(),
};

const singleSchema = z.object(projectFields);
const bulkSchema = z.object({ projects: z.array(z.object(projectFields)).min(1).max(50) });
const updateSchema = z.object(projectFields).partial().extend({ id: z.number().int().positive() });

export function GET() {
  return NextResponse.json({ projects: getPortfolioProjects() });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));

  // Bulk create (confirmed import).
  if (Array.isArray(body?.projects)) {
    const v = validateBody(bulkSchema, body);
    if (!v.success) return v.response;
    const ids = createPortfolioProjects(v.data.projects as PortfolioProjectData[]);
    return NextResponse.json({ ids, count: ids.length, projects: getPortfolioProjects() });
  }

  // Single create.
  const v = validateBody(singleSchema, body);
  if (!v.success) return v.response;
  const id = createPortfolioProject(v.data as PortfolioProjectData);
  return NextResponse.json({ id, projects: getPortfolioProjects() });
}

export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const v = validateBody(updateSchema, body);
  if (!v.success) return v.response;
  const { id, ...data } = v.data;
  updatePortfolioProject(id, data);
  return NextResponse.json({ ok: true, projects: getPortfolioProjects() });
}

export function DELETE(req: NextRequest) {
  const id = Number(new URL(req.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) {
    return NextResponse.json({ error: "Valid id is required" }, { status: 400 });
  }
  deletePortfolioProject(id);
  return NextResponse.json({ ok: true, projects: getPortfolioProjects() });
}
