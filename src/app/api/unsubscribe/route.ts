import { NextRequest, NextResponse } from "next/server";
import { db } from "@/db";
import { unsubscribes, blacklist, sequenceEnrollments, leads } from "@/db/schema";
import { eq } from "drizzle-orm";
import { logActivity } from "@/lib/activity";

// GET: Handle unsubscribe via token (user clicks link in email)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const token = searchParams.get("token");

  if (!token) {
    return new NextResponse(renderPage("Error", "Token inválido."), {
      headers: { "Content-Type": "text/html" },
      status: 400,
    });
  }

  const record = db.select().from(unsubscribes).where(eq(unsubscribes.token, token)).get();
  if (!record) {
    return new NextResponse(renderPage("Error", "Este enlace no es válido o ya fue utilizado."), {
      headers: { "Content-Type": "text/html" },
      status: 404,
    });
  }

  if (record.unsubscribedAt) {
    return new NextResponse(renderPage("Ya dado de baja", "Ya te habías dado de baja anteriormente. No recibirás más comunicaciones."), {
      headers: { "Content-Type": "text/html" },
    });
  }

  // Mark as unsubscribed
  db.update(unsubscribes)
    .set({ unsubscribedAt: new Date().toISOString() })
    .where(eq(unsubscribes.id, record.id))
    .run();

  // Add email to blacklist
  const existing = db.select().from(blacklist).where(eq(blacklist.value, record.email)).get();
  if (!existing) {
    db.insert(blacklist).values({
      type: "email",
      value: record.email,
      reason: "Unsubscribed via email link",
    }).run();
  }

  // Stop any active sequences for this lead
  if (record.leadId) {
    db.update(sequenceEnrollments)
      .set({ status: "unsubscribed", completedAt: new Date().toISOString() })
      .where(eq(sequenceEnrollments.leadId, record.leadId))
      .run();
  }

  logActivity("blacklist", `${record.email} se dio de baja via link`, {
    leadId: record.leadId ?? undefined,
  });

  return new NextResponse(renderPage("Baja confirmada", "Has sido dado de baja correctamente. No recibirás más comunicaciones de nuestra parte."), {
    headers: { "Content-Type": "text/html" },
  });
}

function renderPage(title: string, message: string): string {
  return `<!DOCTYPE html>
<html lang="es">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>body{font-family:system-ui,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;background:#fafafa;color:#333}
.card{background:#fff;border:1px solid #e5e5e5;border-radius:8px;padding:40px;max-width:400px;text-align:center}
h1{font-size:20px;margin:0 0 12px}p{font-size:14px;color:#666;margin:0}</style>
</head>
<body><div class="card"><h1>${title}</h1><p>${message}</p></div></body>
</html>`;
}
