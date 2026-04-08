import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { blacklist } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { logActivity } from "@/lib/activity";

export async function GET() {
  const all = db.select().from(blacklist).orderBy(desc(blacklist.createdAt)).all();
  return NextResponse.json(all);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body.type || !body.value) {
    return NextResponse.json({ error: "type and value required" }, { status: 400 });
  }

  try {
    const result = db.insert(blacklist).values({
      type: body.type,
      value: body.value.toLowerCase().trim(),
      reason: body.reason || null,
    }).returning().get();

    logActivity("blacklist", `Añadido a blacklist: ${body.value}`, {
      metadata: { type: body.type, value: body.value },
      messageKey: "activityLog.leadBlacklisted",
      messageVars: { name: body.value },
    });

    return NextResponse.json(result, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Already in blacklist" }, { status: 409 });
  }
}

export async function DELETE(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return NextResponse.json({ error: "ID required" }, { status: 400 });

  db.delete(blacklist).where(eq(blacklist.id, Number(id))).run();
  return NextResponse.json({ success: true });
}
