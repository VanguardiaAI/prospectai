import { getAgencyContext, getLocaleLabel, getLocaleWritingRules, SERVICE_DEFINITIONS, formatAgencyContextBlock } from "./config";
import { generateStructured } from "./provider";
import { withRetry } from "@/lib/ai/retry";
import { sanitizeIssues } from "@/lib/lead-quality";
import { GEMINI_MAX_RETRIES, GEMINI_BASE_DELAY_MS } from "@/lib/constants";
import {
  formatWhatsAppExamples,
  ANTI_AI_RULES,
  PERSONA_BLOCK,
  SELF_CHECK_WHATSAPP,
  type CopyPurpose,
} from "./examples";
import type { WebAnalysis, WhatsAppGeneration } from "./types";

const WHATSAPP_SCHEMA = {
  type: "object",
  properties: {
    message: { type: "string" },
  },
  required: ["message"],
  additionalProperties: false,
} as const;

export async function generateWhatsApp(
  businessName: string,
  businessCategory: string | null,
  city: string | null,
  websiteUrl: string | null,
  analysis: WebAnalysis | null,
  tone: string,
  fromName: string,
  sequenceStep?: number,
  customInstructions?: string,
  leadCountry?: string,
  agencyProfileId?: number | null
): Promise<WhatsAppGeneration> {
  const ctx = getAgencyContext(agencyProfileId);
  const effectiveCountry = leadCountry || ctx.country;
  const localeLabel = getLocaleLabel(effectiveCountry);
  const writingRules = getLocaleWritingRules(effectiveCountry);

  const purpose: CopyPurpose = !sequenceStep || sequenceStep === 1 ? "initial" : "follow_up";

  const analysisContext = analysis
    ? `\nANÁLISIS DE PRESENCIA DIGITAL:
- Score web: ${analysis.qualityScore}/100
- Score SEO: ${analysis.seoScore ?? "N/A"}/100
- Issues: ${sanitizeIssues(analysis.issues).join(", ")}
- Oportunidades SEO: ${sanitizeIssues(analysis.seoIssues).join(", ")}
- Oportunidades IA: ${(analysis.aiAgentOpportunities || []).join(", ")}
- Servicios recomendados: ${(analysis.recommendedServices || []).map((k) => SERVICE_DEFINITIONS[k]?.label || k).join(", ")}
- Resumen: ${analysis.summary}`
    : "\nLa web no ha sido analizada o no tienen web.";

  const stepContext = sequenceStep && sequenceStep > 1
    ? `\nESTE ES FOLLOW-UP #${sequenceStep - 1}. Ya les contactaste antes. Sé más breve y directo. Cambia el ángulo. Puedes hacer referencia a que ya escribiste ("te escribí hace unos días…").`
    : "";

  const extraInstructions = customInstructions ? `\nINSTRUCCIONES ADICIONALES DEL USUARIO: ${customInstructions}` : "";

  const examplesBlock = formatWhatsAppExamples(purpose, 3);

  const prompt = `${PERSONA_BLOCK(fromName, ctx.name)}

CONTEXTO DE LA AGENCIA QUE ESCRIBE (identidad y servicios; NO inventes datos que no estén aquí):
${formatAgencyContextBlock(ctx, { identityOnly: true })}

DATOS DEL NEGOCIO AL QUE ESCRIBES:
- Nombre: ${businessName}
- Categoría: ${businessCategory || "Sin especificar"}
- Ciudad: ${city || "Sin especificar"}
- Web actual: ${websiteUrl || "No tiene"}
${analysisContext}

TONO PEDIDO: ${tone}
${stepContext}
${extraInstructions}

OBJETIVO DEL MENSAJE:
El destinatario debe sentir que GANA algo respondiendo. NO le auditas ni le señalas defectos: le muestras cómo puede tener MÁS CLIENTES o MÁS VENTAS. Cada problema técnico que menciones debe traducirse a impacto de negocio tangible.

ESTRUCTURA DEL MENSAJE (en una sola burbuja, sin splits):
1. SALUDO + IDENTIFICACIÓN (1 línea breve): "Hola [nombre], soy [tu nombre] de [agencia]".
2. OBSERVACIÓN CONCRETA (1-2 líneas): algo VERDADERO y específico de su negocio (de la auditoría) conectado a clientes o ventas. NADA de cumplidos vagos o de relleno ("se nota que llevan tiempo", "tienen un gran servicio"): suenan huecos e insinceros. Si no hay algo específico, ve directo al punto útil.
3. PROPUESTA / PERMISSION ASK (1 línea): qué les ofreces o qué les pides poder enviarles, concreto y de bajo compromiso. NO menciones proyectos ni clientes que no conocen, NI presentes tu agencia o su tamaño/productos ("somos un directorio con X doctores"): en un primer mensaje suena a presumir y es relleno.
4. PREGUNTA ABIERTA (al final del mismo bloque): "te interesa?", "te animas?", "tiene sentido?".

REGLAS DE WHATSAPP B2B:
1. Idioma: ${localeLabel}
2. Máximo 300 caracteres. WhatsApp es conversacional, no formal.
3. Una sola burbuja, NUNCA splits en mensajes consecutivos (parece spam masivo).
4. CERO links, URLs, dominios. Disparan filtros de spam y bloqueo de número.
5. CERO o MÁXIMO 1 emoji. Mejor 0 en B2B salvo señalado.
6. NO uses jerga técnica sin explicar el impacto. Nada de "SSL", "responsive", "SEO" sueltos.
7. NUNCA digas "Soy ${ctx.name}". Eres "${fromName}, de ${ctx.name}".
8. NUNCA pidas reunión directa, llamada o calendario en cold #1. Cierre = pregunta abierta.
9. NUNCA uses "gratis", "sin compromiso", "auditoría gratis". Alternativas naturales: "te paso un análisis", "te enseño cómo funciona".

${ANTI_AI_RULES}

ADAPTACIÓN REGIONAL (CRÍTICA):
El negocio está en ${city || "ubicación no especificada"}. Adapta al país de ESA ciudad, NO al país de la agencia. Si está en México, español mexicano (sin "vosotros", sin "tío", sin "vale"). Si en Argentina, voseo. Si en España, español de España.
${writingRules}

EJEMPLOS DEL ESTILO QUE QUEREMOS (referencia obligatoria de tono, no copies literal):
${examplesBlock}

${SELF_CHECK_WHATSAPP}`;

  return withRetry(
    () => generateStructured<WhatsAppGeneration>({ prompt, jsonSchema: WHATSAPP_SCHEMA, label: "generate-whatsapp" }),
    { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS, label: "generate-whatsapp" },
  );
}

export async function regenerateWhatsApp(
  businessName: string,
  businessCategory: string | null,
  city: string | null,
  websiteUrl: string | null,
  analysis: WebAnalysis | null,
  tone: string,
  fromName: string,
  previousMessage: string,
  instructions: string,
  leadCountry?: string,
  agencyProfileId?: number | null
): Promise<WhatsAppGeneration> {
  const ctx = getAgencyContext(agencyProfileId);
  const effectiveCountry = leadCountry || ctx.country;
  const localeLabel = getLocaleLabel(effectiveCountry);
  const writingRules = getLocaleWritingRules(effectiveCountry);

  const examplesBlock = formatWhatsAppExamples("initial", 3);

  const prompt = `${PERSONA_BLOCK(fromName, ctx.name)}

Necesitas REGENERAR un mensaje de WhatsApp de prospección que ya tenías escrito, aplicando un nuevo tono o instrucciones.

CONTEXTO DE LA AGENCIA QUE ESCRIBE (identidad y servicios; NO inventes datos que no estén aquí):
${formatAgencyContextBlock(ctx, { identityOnly: true })}

DATOS DEL NEGOCIO:
- Nombre: ${businessName}
- Categoría: ${businessCategory || "Sin especificar"}
- Ciudad: ${city || "Sin especificar"}
- Web: ${websiteUrl || "No tiene"}

MENSAJE ANTERIOR:
${previousMessage}

NUEVO TONO: ${tone}
INSTRUCCIONES ADICIONALES: ${instructions || "Solo cambia el tono"}
Idioma: ${localeLabel}

REGLAS:
- Máximo 300 caracteres, conversacional, sin HTML, sin links/URLs/dominios.
- Máximo 1 emoji (mejor 0).
- Foco en lo que GANA el destinatario (más clientes, más ventas), NO en listar problemas técnicos.
- Cada problema → impacto de negocio.
- NUNCA "gratis", "sin compromiso", "auditoría gratis".
- NUNCA jerga técnica sin explicar.
- NUNCA pidas reunión/llamada/calendario directo. Cierre con pregunta abierta tipo "te interesa?".
- Puedes hablar de web, SEO, IA, Google Business o redes sociales según lo más relevante.

${ANTI_AI_RULES}

ADAPTACIÓN REGIONAL (CRÍTICA):
El negocio está en ${city || "ubicación no especificada"}. Adapta al país de ESA ciudad. Si está en México, español mexicano. Si en Argentina, voseo. Si en España, español de España.
${writingRules}

EJEMPLOS DEL ESTILO QUE QUEREMOS (no copies literal, captura el tono):
${examplesBlock}

${SELF_CHECK_WHATSAPP}`;

  return withRetry(
    () => generateStructured<WhatsAppGeneration>({ prompt, jsonSchema: WHATSAPP_SCHEMA, label: "regenerate-whatsapp" }),
    { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS, label: "regenerate-whatsapp" },
  );
}
