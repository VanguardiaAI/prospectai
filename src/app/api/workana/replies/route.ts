import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/db";
import { listReplies, setReplyStatus } from "@/db/workana";
import { processWorkanaReplies } from "@/lib/cron/workana-replies";

// Drives the browser + AI → Node runtime, never cached. Auth via src/proxy.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function enabled(): boolean {
  return getSetting("workana_enabled") === "true";
}

export async function GET() {
  if (!enabled()) return NextResponse.json({ error: "workana_disabled" }, { status: 403 });
  return NextResponse.json({ replies: listReplies(60) });
}

// POST: check the inbox now (manual). PUT: triage { id, action: "handle"|"unhandle" }.
export async function POST() {
  if (!enabled()) return NextResponse.json({ error: "workana_disabled" }, { status: 403 });
  try {
    const result = await processWorkanaReplies();
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  if (!enabled()) return NextResponse.json({ error: "workana_disabled" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!id || !Number.isFinite(id)) return NextResponse.json({ error: "id required" }, { status: 400 });
  const status = body?.action === "unhandle" ? "unread" : "handled";
  setReplyStatus(id, status);
  return NextResponse.json({ ok: true, id, status });
}
