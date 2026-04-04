import { NextRequest, NextResponse } from "next/server";
import { importLeadsFromCSV } from "@/lib/csv-importer";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;
    const campaignId = formData.get("campaignId") as string;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    const csvText = await file.text();
    const result = importLeadsFromCSV(csvText, campaignId ? Number(campaignId) : undefined);

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Import failed" },
      { status: 500 }
    );
  }
}
