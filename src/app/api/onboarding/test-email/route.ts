import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { validateBody } from "@/lib/validations";
import { sendEmail } from "@/lib/email-sender";
import { handleServiceError } from "@/services/api-handler";

const testEmailSchema = z.object({
  to: z.string().email(),
  fromEmail: z.string().email(),
  fromName: z.string().min(1),
  agencyName: z.string().min(1),
  tone: z.string().min(1),
});

const TONE_HOOKS: Record<string, string> = {
  professional: "Te escribo para mostrarte cómo se vería un email enviado desde tu cuenta de ProspectAI.",
  friendly: "¡Hola! Solo un mensaje rápido para que veas cómo se sentirán tus emails antes de salir.",
  direct: "Email de prueba. Si te llega bien, ya estás listo para enviar a leads reales.",
  consultative: "Quería compartirte una vista previa del estilo de mensajes que enviarás. Cualquier feedback es bienvenido.",
  casual: "Hey, esto es solo una prueba. Si lo lees bien, todo funciona como debería.",
};

export async function POST(req: NextRequest) {
  const body = await req.json();
  const v = validateBody(testEmailSchema, body);
  if (!v.success) return v.response;

  try {
    const { to, fromEmail, fromName, agencyName, tone } = v.data;
    const hook = TONE_HOOKS[tone] || TONE_HOOKS.professional;

    const subject = `prueba de configuración — ${agencyName.toLowerCase()}`;
    const text = `${hook}

Esto es un email de prueba enviado desde ProspectAI con tu remitente actual.
Si lo recibes en bandeja principal y se ve bien, tu configuración de envío está lista.

— ${fromName}`;

    const html = `<p>${hook}</p>
<p>Esto es un email de prueba enviado desde ProspectAI con tu remitente actual.<br>
Si lo recibes en bandeja principal y se ve bien, tu configuración de envío está lista.</p>
<p>— ${fromName}</p>`;

    const result = await sendEmail({
      to,
      from: `${fromName} <${fromEmail}>`,
      subject,
      html,
      text,
    });

    if (!result.success) {
      return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
    }

    return NextResponse.json({ ok: true, id: result.id });
  } catch (err) {
    return handleServiceError(err);
  }
}
