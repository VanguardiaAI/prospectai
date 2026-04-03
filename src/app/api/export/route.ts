import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { leads } from "@/db/schema";
import { eq, and, lte } from "drizzle-orm";
import * as XLSX from "xlsx";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const campaignId = searchParams.get("campaignId");
  const status = searchParams.get("status");
  const maxQuality = searchParams.get("maxQuality");

  const conditions = [];
  if (campaignId) conditions.push(eq(leads.campaignId, Number(campaignId)));
  if (status) conditions.push(eq(leads.status, status as typeof leads.status.enumValues[number]));
  if (maxQuality) conditions.push(lte(leads.webQualityScore, Number(maxQuality)));

  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = db.select().from(leads).where(where).all();

  const exportData = rows.map((r) => ({
    Nombre: r.name,
    Categoría: r.category,
    Ciudad: r.city,
    Estado: r.state,
    Teléfono: r.phone,
    Email: r.contactEmail || r.extractedEmail || r.email,
    "Sitio Web": r.website,
    "Calidad Web": r.webQualityScore,
    "Oportunidad": r.opportunityScore,
    Status: r.status,
    "Resumen Análisis": r.analysisSummary,
    Notas: r.notes,
    "Importado": r.importedAt,
    "Email Enviado": r.emailSentAt,
  }));

  const ws = XLSX.utils.json_to_sheet(exportData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Leads");

  const buf = XLSX.write(wb, { type: "buffer", bookType: "xlsx" });

  return new NextResponse(buf, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="prospect-ai-leads-${new Date().toISOString().split("T")[0]}.xlsx"`,
    },
  });
}
