import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateBody, updateNotesSchema } from "@/lib/validations";

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(updateNotesSchema, body);
  if (!v.success) return v.response;

  db.update(leads).set({ notes: v.data.notes }).where(eq(leads.id, v.data.leadId)).run();
  return NextResponse.json({ success: true });
}
