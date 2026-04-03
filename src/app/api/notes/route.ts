import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";

export async function PUT(req: NextRequest) {
  const body = await req.json();
  if (!body.leadId) return NextResponse.json({ error: "leadId required" }, { status: 400 });

  db.update(leads).set({ notes: body.notes }).where(eq(leads.id, body.leadId)).run();
  return NextResponse.json({ success: true });
}
