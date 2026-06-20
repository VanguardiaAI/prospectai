import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/db";
import { processWorkanaScans } from "@/lib/cron/workana-scan";
import { listProjects, listProposals } from "@/db/workana";

// Drives the browser + AI → Node runtime, never cached. Auth via src/proxy.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function enabled(): boolean {
  return getSetting("workana_enabled") === "true";
}

// List evaluated projects + drafted proposals.
export async function GET() {
  if (!enabled()) return NextResponse.json({ error: "workana_disabled" }, { status: 403 });
  return NextResponse.json({ projects: listProjects(120), proposals: listProposals(60) });
}

// Trigger a scan now (manual). Optional body: { maxEval, maxDrafts }.
export async function POST(req: NextRequest) {
  if (!enabled()) return NextResponse.json({ error: "workana_disabled" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const maxEval = Number.isFinite(body?.maxEval) ? Number(body.maxEval) : undefined;
  const maxDrafts = Number.isFinite(body?.maxDrafts) ? Number(body.maxDrafts) : undefined;
  try {
    const result = await processWorkanaScans({ force: true, maxEval, maxDrafts });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
