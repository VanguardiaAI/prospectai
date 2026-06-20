import { NextRequest, NextResponse } from "next/server";
import { parseTabular, suggestMapping, importLeadsFromRows } from "@/lib/csv-importer";

// Handles both the import PREVIEW (detect columns + suggest a mapping) and the
// actual mapped import. Accepts CSV/TSV and XLSX/XLS files.
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) {
      return NextResponse.json({ error: "No se proporcionó ningún archivo" }, { status: 400 });
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const { headers, rows } = parseTabular(buf, file.name);

    // Preview: return detected columns + a suggested mapping + a few sample rows.
    if (formData.get("preview")) {
      return NextResponse.json({
        success: true,
        headers,
        suggestedMapping: suggestMapping(headers),
        sample: rows.slice(0, 5),
        total: rows.length,
      });
    }

    const campaignId = formData.get("campaignId") as string | null;
    const tagsRaw = (formData.get("tags") as string | null) || "";
    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);
    const mappingRaw = formData.get("mapping") as string | null;
    const mapping = mappingRaw ? (JSON.parse(mappingRaw) as Record<string, string>) : undefined;

    const result = importLeadsFromRows(rows, {
      campaignId: campaignId ? Number(campaignId) : undefined,
      tags,
      source: "csv",
      mapping,
    });

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Error al importar" },
      { status: 500 }
    );
  }
}
