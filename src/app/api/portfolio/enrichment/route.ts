import { NextRequest, NextResponse } from "next/server";
import { listEnrichment, insertEnrichmentQuestions, answerEnrichmentItem, skipEnrichmentItem } from "@/db/portfolio";
import { generateEnrichmentQuestions } from "@/lib/ai/portfolio";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Auth is enforced by src/proxy.ts.

// GET: the interview queue — pending questions + the answered ones (for review).
export function GET() {
  return NextResponse.json({
    pending: listEnrichment({ status: "pending" }),
    answered: listEnrichment({ status: "answered" }),
  });
}

// POST { action: "generate" }: ask the AI for a new batch of questions and persist
// them as pending (already-asked questions are excluded inside the generator).
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body?.action !== "generate") {
    return NextResponse.json({ error: "unknown_action" }, { status: 400 });
  }
  try {
    const items = await generateEnrichmentQuestions(null, 6);
    const ids = insertEnrichmentQuestions(items);
    return NextResponse.json({ added: ids.length, pending: listEnrichment({ status: "pending" }) });
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

// PUT { id, action: "answer" | "skip", answer? }: record the user's response.
export async function PUT(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const id = Number(body?.id);
  if (!id || !Number.isFinite(id)) {
    return NextResponse.json({ error: "id required" }, { status: 400 });
  }
  if (body?.action === "skip") {
    skipEnrichmentItem(id);
    return NextResponse.json({ ok: true, status: "skipped" });
  }
  const answer = typeof body?.answer === "string" ? body.answer.trim() : "";
  if (!answer) {
    return NextResponse.json({ error: "answer required" }, { status: 400 });
  }
  answerEnrichmentItem(id, answer);
  return NextResponse.json({ ok: true, status: "answered" });
}
