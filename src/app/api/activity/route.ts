import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { activityLog } from "@/db/schema";
import { desc, eq, and } from "drizzle-orm";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "50");
  const offset = (page - 1) * limit;

  const conditions = [];
  if (type) conditions.push(eq(activityLog.type, type as typeof activityLog.type.enumValues[number]));

  const where = conditions.length > 0 ? and(...conditions) : undefined;

  const rows = db.select().from(activityLog).where(where).orderBy(desc(activityLog.createdAt)).limit(limit).offset(offset).all();

  return NextResponse.json({ activity: rows, page, limit });
}
