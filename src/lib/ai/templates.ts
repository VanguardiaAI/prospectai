import { getAgencyContext, getLocaleLabel, getLocaleWritingRules } from "./config";
import { generateStructured } from "./provider";
import { withRetry } from "@/lib/ai/retry";
import { GEMINI_MAX_RETRIES, GEMINI_BASE_DELAY_MS } from "@/lib/constants";
import {
  ANTI_AI_RULES,
  PERSONA_BLOCK,
  SELF_CHECK_EMAIL,
  SELF_CHECK_WHATSAPP,
} from "./examples";
import type { TemplateGeneration, WhatsAppTemplateGeneration } from "./types";

const EMAIL_TEMPLATE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    subject: { type: "string" },
    bodyHtml: { type: "string" },
    bodyText: { type: "string" },
    variables: { type: "array", items: { type: "string" } },
  },
  required: ["name", "subject", "bodyHtml", "bodyText", "variables"],
  additionalProperties: false,
} as const;

const WHATSAPP_TEMPLATE_SCHEMA = {
  type: "object",
  properties: {
    name: { type: "string" },
    message: { type: "string" },
    variables: { type: "array", items: { type: "string" } },
  },
  required: ["name", "message", "variables"],
  additionalProperties: false,
} as const;

export async function generateEmailTemplate(
  industry: string,
  purpose: "initial" | "follow_up" | "breakup",
  tone: string,
  customInstructions?: string
): Promise<TemplateGeneration> {
  const ctx = getAgencyContext();
  const localeLabel = getLocaleLabel(ctx.country);
  const writingRules = getLocaleWritingRules(ctx.country);
  const servicesDesc = ctx.services.map((s) => `- ${s.label}: ${s.description}`).join("\n");

  const purposeMap = {
    initial: "Primer contacto, email inicial de prospección en frío",
    follow_up: "Follow-up, segundo o tercer contacto, ángulo distinto, más breve",
    breakup: "Breakup, último mensaje de la secuencia, despedida cordial",
  };

  const wordLimits = {
    initial: 110,
    follow_up: 75,
    breakup: 60,
  };

  const wordLabels = {
    initial: "75-110 palabras",
    follow_up: "50-75 palabras",
    breakup: "40-60 palabras",
  };

  const prompt = `${PERSONA_BLOCK("[el remitente]", ctx.name)}

Tu trabajo aquí: GENERAR UNA PLANTILLA REUTILIZABLE de email para la industria "${industry}". La plantilla debe usar variables {{placeholder}} y luego se rellenará por cada lead concreto.

PROPÓSITO: ${purposeMap[purpose]}
TONO: ${tone}
IDIOMA: ${localeLabel}
${customInstructions ? `INSTRUCCIONES ADICIONALES: ${customInstructions}` : ""}

SERVICIOS DE LA AGENCIA:
${servicesDesc}

PRINCIPIO FUNDAMENTAL — ENFOQUE EN BENEFICIO:
Al destinatario NO le importan los problemas técnicos. Le importa MÁS CLIENTES y MÁS VENTAS. Cada problema debe traducirse a impacto de negocio:
- "Sin SSL" → "Los visitantes ven 'no seguro' y se van a la competencia"
- "No responsive" → "El 70% busca desde el móvil y no puede navegar bien la web"
- "SEO bajo" → "Cuando alguien busca {{category}} en {{city}}, aparece la competencia y ellos no"
- "Sin web" → "Los clientes que buscan en Google no los encuentran"

REGLAS DE LA PLANTILLA:
1. LONGITUD: ${wordLabels[purpose]} en el cuerpo. Es un techo, no un objetivo.
2. FORMATO: texto plano con HTML mínimo (<p>, <br>, <b>). NADA de imágenes, colores ni headers HTML.
3. ASUNTO: 4-7 palabras, en minúsculas, que despierte curiosidad sobre el BENEFICIO. Ejemplo: "más clientes para {{business_name}}". NO: "problemas con tu web".
4. CTA ÚNICO: pregunta suave orientada al beneficio. NUNCA "Reserva una demo" ni "Agenda una llamada".
5. ESTRUCTURA (4 bloques cortos):
   - APERTURA específica: 1-2 frases con observación concreta usando variables.
   - PUENTE AL PROBLEMA: 1-2 frases conectando con clientes/ventas que pierden o pueden capturar.
   - VALOR: 1 frase sobre cómo ayudas a negocios parecidos. Sin prometer cifras exactas.
   - CTA: 1 frase, pregunta abierta sobre el beneficio.
6. FIRMA: solo "{{sender_name}}, de ${ctx.name}". NUNCA "Soy ${ctx.name}". NO añadas pie legal ni baja (lo inyecta el sistema).
7. PARA FOLLOW-UP: cambia de ángulo respecto al inicial. Si el inicial habla de web, el follow-up habla de SEO o IA. Más breve.
8. PARA BREAKUP: despedida cordial, deja la puerta abierta, sin culpa ni presión.
9. COMPLIANCE LEGAL: el email debe identificarse como comunicación comercial. Remitente claro.

${ANTI_AI_RULES}

ADAPTACIÓN REGIONAL:
La plantilla usará la variable {{city}} para personalización. Adapta el idioma al locale: ${localeLabel}. Escribe natural para ese mercado.
${writingRules}

VARIABLES DISPONIBLES en la plantilla:
- {{business_name}}: nombre del negocio
- {{category}}: categoría/industria
- {{city}}: ciudad
- {{website}}: web del negocio
- {{issue}}: issue específico detectado
- {{sender_name}}: nombre del remitente
- {{service}}: servicio recomendado

${SELF_CHECK_EMAIL(wordLimits[purpose])}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "name": "nombre breve y descriptivo de la plantilla",
  "subject": "asunto del email con {{variables}} si aplica",
  "bodyHtml": "cuerpo del email en HTML mínimo (<p>, <b>, <br>)",
  "bodyText": "versión texto plano del email",
  "variables": ["lista", "de", "variables", "usadas"]
}`;

  return withRetry(
    () => generateStructured<TemplateGeneration>({ prompt, jsonSchema: EMAIL_TEMPLATE_SCHEMA, label: "generate-email-template" }),
    { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS, label: "generate-email-template" },
  );
}

export async function generateWhatsAppTemplate(
  industry: string,
  purpose: "initial" | "follow_up" | "breakup",
  tone: string,
  customInstructions?: string
): Promise<WhatsAppTemplateGeneration> {
  const ctx = getAgencyContext();
  const localeLabel = getLocaleLabel(ctx.country);
  const writingRules = getLocaleWritingRules(ctx.country);
  const servicesDesc = ctx.services.map((s) => `- ${s.label}: ${s.description}`).join("\n");

  const purposeMap = {
    initial: "Primer contacto, mensaje inicial de prospección",
    follow_up: "Follow-up, segundo contacto, ángulo distinto, más breve",
    breakup: "Breakup, último mensaje, despedida cordial",
  };

  const prompt = `${PERSONA_BLOCK("[el remitente]", ctx.name)}

Tu trabajo aquí: GENERAR UNA PLANTILLA REUTILIZABLE de WhatsApp para la industria "${industry}". La plantilla debe usar variables {{placeholder}} y luego se rellenará por cada lead concreto.

PROPÓSITO: ${purposeMap[purpose]}
TONO: ${tone}
IDIOMA: ${localeLabel}
${customInstructions ? `INSTRUCCIONES ADICIONALES: ${customInstructions}` : ""}

SERVICIOS DE LA AGENCIA:
${servicesDesc}

PRINCIPIO FUNDAMENTAL — ENFOQUE EN BENEFICIO:
El destinatario debe sentir que GANA algo respondiendo. No le auditas ni señalas defectos: le muestras cómo tener MÁS CLIENTES o MÁS VENTAS. Cada problema técnico → impacto de negocio:
- "Sin web" → "los clientes que buscan en Google no los encuentran, se van a la competencia"
- "Web lenta/mala" → "la gente entra, no carga bien y se va"
- "Sin redes" → "la competencia está captando ahí a tus clientes potenciales"

REGLAS DE LA PLANTILLA WHATSAPP:
1. MÁXIMO 300 caracteres. Una sola burbuja. WhatsApp es conversacional, no formal.
2. Saludo breve y natural ("Hola {{contact_name}},") + identificación rápida ("soy {{sender_name}} de ${ctx.name}").
3. Una observación concreta con variables ({{business_name}}, {{city}}, {{issue}}) traducida a impacto de negocio.
4. Cierre con pregunta abierta tipo "te interesa?", "te animas?", "tiene sentido?". NUNCA pidas reunión/calendario directo.
5. CERO links, URLs o dominios. Disparan filtros de spam y bloqueo.
6. CERO emojis o MÁXIMO 1 si el tono lo permite. Mejor 0.
7. NO uses jerga técnica sin explicar el impacto.
8. NUNCA "Soy ${ctx.name}" — eres "{{sender_name}}, de ${ctx.name}".
9. PARA FOLLOW-UP: referencia el mensaje anterior. Más breve. Cambia de ángulo.
10. PARA BREAKUP: cordial, sin presión, deja puerta abierta.
11. ANTI-BLOCK: mensajes repetitivos o demasiado comerciales generan reportes y bloqueo del número. Naturalidad ante todo.

${ANTI_AI_RULES}

ADAPTACIÓN REGIONAL:
La plantilla usará la variable {{city}} para personalización. Adapta el idioma al locale: ${localeLabel}. Escribe natural para ese mercado.
${writingRules}

VARIABLES DISPONIBLES:
- {{business_name}}: nombre del negocio
- {{category}}: categoría/industria
- {{city}}: ciudad
- {{contact_name}}: nombre del contacto
- {{issue}}: issue detectado
- {{sender_name}}: nombre del remitente
- {{service}}: servicio recomendado

${SELF_CHECK_WHATSAPP}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "name": "nombre breve y descriptivo de la plantilla",
  "message": "el mensaje de WhatsApp con {{variables}}",
  "variables": ["lista", "de", "variables", "usadas"]
}`;

  return withRetry(
    () => generateStructured<WhatsAppTemplateGeneration>({ prompt, jsonSchema: WHATSAPP_TEMPLATE_SCHEMA, label: "generate-whatsapp-template" }),
    { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS, label: "generate-whatsapp-template" },
  );
}
