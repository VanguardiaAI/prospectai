import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validations";
import { scrapeAndExtract } from "@/lib/ai/extract-agency";
import { handleServiceError } from "@/services/api-handler";

const extractSchema = z.object({
  url: z.string().min(3),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(extractSchema, body);
  if (!v.success) return v.response;

  try {
    let url = v.data.url.trim();
    if (!/^https?:\/\//i.test(url)) url = "https://" + url;

    const startedAt = Date.now();
    const { extracted, pagesScraped } = await scrapeAndExtract(url);
    const elapsedMs = Date.now() - startedAt;

    return NextResponse.json({
      ok: true,
      url,
      pagesScraped,
      elapsedMs,
      extracted,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extracción fallida";
    return NextResponse.json(
      { ok: false, error: message },
      { status: 422 }
    );
  }
}
