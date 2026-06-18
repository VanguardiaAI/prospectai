import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/db";
import { getAuthState, getConnectStatus, startConnect, checkSession, disconnect } from "@/lib/workana/auth";
import { scrapeFeed } from "@/lib/workana/scraper";

// Spawns a real browser → must run on the Node.js runtime, never cached.
// Auth is enforced by src/proxy.ts.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function enabled(): boolean {
  return getSetting("workana_enabled") === "true";
}

export async function GET() {
  if (!enabled()) return NextResponse.json({ error: "workana_disabled" }, { status: 403 });
  return NextResponse.json({ authState: getAuthState(), connect: getConnectStatus() });
}

export async function POST(req: NextRequest) {
  if (!enabled()) return NextResponse.json({ error: "workana_disabled" }, { status: 403 });
  const body = await req.json().catch(() => ({}));
  const action = body?.action;

  try {
    if (action === "connect") {
      const status = await startConnect();
      return NextResponse.json({ ok: true, connect: status });
    }
    if (action === "check") {
      const authState = await checkSession();
      return NextResponse.json({ ok: true, authState });
    }
    if (action === "disconnect") {
      await disconnect();
      return NextResponse.json({ ok: true, authState: "disconnected" });
    }
    if (action === "test_scan") {
      const keywords = typeof body?.keywords === "string" ? body.keywords : undefined;
      const projects = await scrapeFeed({ keywords });
      return NextResponse.json({
        ok: true,
        count: projects.length,
        sample: projects.slice(0, 5).map((p) => ({ title: p.title, url: p.url, budget: p.budgetText })),
      });
    }
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}
