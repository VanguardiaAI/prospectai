import { getAgencyContext, getLocaleLabel, getLocaleWritingRules, formatAgencyContextBlock } from "./config";
import { generateStructured } from "./provider";
import { withRetry } from "@/lib/ai/retry";
import { GEMINI_MAX_RETRIES, GEMINI_BASE_DELAY_MS } from "@/lib/constants";
import {
  formatEmailExamples,
  ANTI_AI_RULES,
  PERSONA_BLOCK,
  SELF_CHECK_EMAIL,
  type CopyPurpose,
} from "./examples";
import type { EmailGeneration, WebAnalysis } from "./types";

const EMAIL_SCHEMA = {
  type: "object",
  properties: {
    subject: { type: "string" },
    bodyHtml: { type: "string" },
    bodyText: { type: "string" },
  },
  required: ["subject", "bodyHtml", "bodyText"],
  additionalProperties: false,
} as const;

export async function generateEmail(
  businessName: string,
  businessCategory: string | null,
  city: string | null,
  websiteUrl: string | null,
  analysis: WebAnalysis,
  tone: string,
  fromName: string,
  sequenceStep?: number,
  customInstructions?: string,
  leadCountry?: string,
  agencyProfileId?: number | null
): Promise<EmailGeneration> {
  const ctx = getAgencyContext(agencyProfileId);
  const effectiveCountry = leadCountry || ctx.country;
  const localeLabel = getLocaleLabel(effectiveCountry);
  const writingRules = getLocaleWritingRules(effectiveCountry);

  const purpose: CopyPurpose = !sequenceStep || sequenceStep === 1 ? "initial" : "follow_up";
  const maxWords = purpose === "initial" ? 110 : 75;

  // Build service-specific pitch based on analysis
  const recommendedServices = (analysis.recommendedServices || ["web_development"])
    .map((key) => ctx.services.find((s) => s.key === key))
    .filter(Boolean)
    .map((s) => `- ${s!.label}: ${s!.description}`)
    .join("\n");

  // Build issue context from all analysis angles
  const issueContext: string[] = [];
  if (analysis.issues.length > 0) issueContext.push(`Web issues: ${analysis.issues.join(", ")}`);
  if (analysis.seoIssues?.length > 0) issueContext.push(`SEO issues: ${analysis.seoIssues.join(", ")}`);
  if (analysis.googleBusinessOpportunities?.length > 0) issueContext.push(`Google Business opportunities: ${analysis.googleBusinessOpportunities.join(", ")}`);
  if (analysis.aiAgentOpportunities?.length > 0) issueContext.push(`AI opportunities: ${analysis.aiAgentOpportunities.join(", ")}`);

  const stepContext = sequenceStep && sequenceStep > 1
    ? `\nESTE ES FOLLOW-UP #${sequenceStep - 1}. El negocio ya recibió ${sequenceStep - 1} mensaje(s) previo(s). NO repitas lo que probablemente ya dijiste. Cambia el ángulo: si en el inicial hablaste de web, ahora habla de SEO o de IA. Sé más breve y directo. Puedes hacer referencia a que ya escribiste antes ("la semana pasada te escribí…").`
    : "";

  const extraInstructions = customInstructions ? `\nINSTRUCCIONES ADICIONALES DEL USUARIO: ${customInstructions}` : "";

  const examplesBlock = formatEmailExamples(purpose, 3);

  const prompt = `${PERSONA_BLOCK(fromName, ctx.name)}

CONTEXTO DE LA AGENCIA QUE ESCRIBE (úsalo de forma natural, NO inventes datos que no estén aquí):
${formatAgencyContextBlock(ctx)}

DATOS DEL NEGOCIO AL QUE ESCRIBES:
- Nombre: ${businessName}
- Categoría: ${businessCategory || "Sin especificar"}
- Ciudad: ${city || "Sin especificar"}
- Web actual: ${websiteUrl || "No tiene"}

ANÁLISIS DE PRESENCIA DIGITAL:
- Score web: ${analysis.qualityScore}/100
- Score SEO: ${analysis.seoScore ?? "N/A"}/100
${issueContext.map((i) => `- ${i}`).join("\n")}
- Resumen: ${analysis.summary}

SERVICIOS RELEVANTES PARA ESTE NEGOCIO:
${recommendedServices}

TONO PEDIDO: ${tone}
${stepContext}
${extraInstructions}

PRINCIPIO FUNDAMENTAL — ENFOQUE EN BENEFICIO:
Al destinatario NO le importan los problemas técnicos. Le importa tener MÁS CLIENTES y MÁS VENTAS. Cada problema que menciones debe traducirse a impacto de negocio:
- "Sin SSL" → "Los visitantes ven 'sitio no seguro' y se van a la competencia"
- "No responsive" → "El 70% busca desde el móvil y no puede navegar bien la web"
- "SEO bajo" → "Cuando alguien busca [su categoría] en [su ciudad], aparece la competencia y ellos no"
- "Sin web" → "Todos los clientes que buscan en Google un negocio como el suyo no los encuentran"
- "Contenido hackeado/spam" → "Google puede estar penalizando el sitio y los clientes ven contenido que daña la imagen del negocio"

ESTRUCTURA DEL EMAIL (4 bloques cortos):
1. APERTURA específica (1-2 frases): observación concreta sobre ESTE negocio que demuestra que lo miraste de verdad. NO cumplidos genéricos.
2. PUENTE AL PROBLEMA (1-2 frases): conecta lo que viste con clientes/ventas que están perdiendo o podrían capturar. NUNCA listes problemas técnicos sueltos.
3. VALOR / SOCIAL PROOF breve (1 frase): cómo ayudas a negocios parecidos. Sin prometer resultados exactos.
4. CTA suave (1 frase): pregunta abierta o "interest check". NUNCA pidas reunión directa, calendario o llamada en cold #1.

LONGITUD: Cuerpo entre 75 y ${maxWords} palabras. Es un techo, no un objetivo. Si con 60 palabras dices todo, mejor.

ASUNTO: 4-7 palabras, en minúsculas (sentence case), que despierte curiosidad sobre el BENEFICIO o haga referencia específica al negocio. NO mayúsculas, NO signos de exclamación, NO palabras spam.

${ANTI_AI_RULES}

REGLAS ADICIONALES:
1. Idioma: ${localeLabel}
2. Preséntate como "${fromName}, de ${ctx.name}" si lo necesitas. NUNCA digas "Soy ${ctx.name}" ni te presentes como si fueras la empresa.
3. NO uses jerga técnica sin traducir a impacto de negocio (no "SSL", "responsive", "SEO", "meta tags" sueltos).
4. NO añadas pie de página legal ni texto de baja, el sistema los inyecta automáticamente.
5. Firma solo con el nombre (sin cargo, sin URL).

ADAPTACIÓN REGIONAL (CRÍTICA):
El negocio está en ${city || "ubicación no especificada"}. Adapta el idioma al país de ESA ciudad, NO al país de la agencia. Si la ciudad está en México, español mexicano. Si en Argentina, voseo argentino. Si en España, español de España. Esto es OBLIGATORIO.
${writingRules}

EJEMPLOS DEL ESTILO QUE QUEREMOS (referencia obligatoria de tono, no copies literal):
${examplesBlock}

${SELF_CHECK_EMAIL(maxWords)}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "subject": "asunto del email",
  "bodyHtml": "cuerpo del email en HTML mínimo (<p>, <b>, <br>, <a>)",
  "bodyText": "versión texto plano del email"
}`;

  return withRetry(
    () => generateStructured<EmailGeneration>({ prompt, jsonSchema: EMAIL_SCHEMA, label: "generate-email" }),
    { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS, label: "generate-email" },
  );
}

export async function regenerateEmail(
  businessName: string,
  businessCategory: string | null,
  city: string | null,
  websiteUrl: string | null,
  analysis: WebAnalysis,
  tone: string,
  fromName: string,
  previousSubject: string,
  previousBody: string,
  instructions: string,
  leadCountry?: string,
  agencyProfileId?: number | null
): Promise<EmailGeneration> {
  const ctx = getAgencyContext(agencyProfileId);
  const effectiveCountry = leadCountry || ctx.country;
  const localeLabel = getLocaleLabel(effectiveCountry);
  const writingRules = getLocaleWritingRules(effectiveCountry);

  const examplesBlock = formatEmailExamples("initial", 3);

  const prompt = `${PERSONA_BLOCK(fromName, ctx.name)}

Necesitas REGENERAR un email de prospección que ya tenías escrito, aplicando un nuevo tono o instrucciones.

CONTEXTO DE LA AGENCIA QUE ESCRIBE (úsalo de forma natural, NO inventes datos que no estén aquí):
${formatAgencyContextBlock(ctx)}

DATOS DEL NEGOCIO:
- Nombre: ${businessName}
- Categoría: ${businessCategory || "Sin especificar"}
- Ciudad: ${city || "Sin especificar"}
- Web: ${websiteUrl || "No tiene"}
- Calidad web: ${analysis.qualityScore}/100
- SEO: ${analysis.seoScore ?? "N/A"}/100
- Issues: ${analysis.issues.join(", ")}
- Oportunidades SEO: ${(analysis.seoIssues || []).join(", ")}
- Oportunidades IA: ${(analysis.aiAgentOpportunities || []).join(", ")}

EMAIL ANTERIOR:
Asunto: ${previousSubject}
Cuerpo: ${previousBody}

NUEVO TONO: ${tone}
INSTRUCCIONES ADICIONALES: ${instructions || "Solo cambia el tono"}
Idioma: ${localeLabel}

PRINCIPIO CLAVE: el email se centra en lo que el destinatario GANA (más clientes, más ventas, más visibilidad), NO en listar problemas técnicos. Cada problema se traduce a impacto de negocio. NO uses "gratis", "sin compromiso", "auditoría gratis" — usa alternativas naturales.

NO añadas pie legal ni texto de baja, el sistema los inyecta.

${ANTI_AI_RULES}

ADAPTACIÓN REGIONAL (CRÍTICA):
El negocio está en ${city || "ubicación no especificada"}. Adapta al país de ESA ciudad. Si está en México, español mexicano. Si en Argentina, voseo. Si en España, español de España.
${writingRules}

EJEMPLOS DEL ESTILO QUE QUEREMOS (no copies literal, captura el tono):
${examplesBlock}

${SELF_CHECK_EMAIL(110)}

Genera una versión diferente del email. Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "subject": "nuevo asunto",
  "bodyHtml": "nuevo HTML",
  "bodyText": "nueva versión texto plano"
}`;

  return withRetry(
    () => generateStructured<EmailGeneration>({ prompt, jsonSchema: EMAIL_SCHEMA, label: "regenerate-email" }),
    { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS, label: "regenerate-email" },
  );
}
