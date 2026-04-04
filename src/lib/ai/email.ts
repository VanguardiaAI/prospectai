import { genAI, safeParseJSON, cleanJsonResponse, getAgencyContext, getLocaleLabel, getLocaleWritingRules } from "./config";
import type { EmailGeneration, WebAnalysis } from "./types";

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
  leadCountry?: string
): Promise<EmailGeneration> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const ctx = getAgencyContext();
  const effectiveCountry = leadCountry || ctx.country;
  const localeLabel = getLocaleLabel(effectiveCountry);
  const writingRules = getLocaleWritingRules(effectiveCountry);

  // Build service-specific pitch based on analysis
  const recommendedServices = (analysis.recommendedServices || ["web_development"])
    .map((key) => ctx.services.find((s) => s.key === key))
    .filter(Boolean)
    .map((s) => `- ${s!.label}: ${s!.description}`)
    .join("\n");

  // Build issue context from all analysis angles
  const issueContext: string[] = [];
  if (analysis.issues.length > 0) issueContext.push(`Problemas web: ${analysis.issues.join(", ")}`);
  if (analysis.seoIssues?.length > 0) issueContext.push(`Problemas SEO: ${analysis.seoIssues.join(", ")}`);
  if (analysis.googleBusinessOpportunities?.length > 0) issueContext.push(`Oportunidades Google Business: ${analysis.googleBusinessOpportunities.join(", ")}`);
  if (analysis.aiAgentOpportunities?.length > 0) issueContext.push(`Oportunidades IA: ${analysis.aiAgentOpportunities.join(", ")}`);

  const stepContext = sequenceStep && sequenceStep > 1
    ? `\nEste es el FOLLOW-UP #${sequenceStep - 1}. El negocio ya recibió ${sequenceStep - 1} mensaje(s) previo(s). NO repitas lo que probablemente ya dijiste. Cambia el ángulo: si antes hablaste de web, ahora habla de SEO o IA. Sé más breve y directo. Puedes hacer referencia a que ya les contactaste antes.`
    : "";

  const extraInstructions = customInstructions ? `\nINSTRUCCIONES ADICIONALES: ${customInstructions}` : "";

  const prompt = `Eres un copywriter experto generando emails de prospección para ${ctx.name} (${ctx.url}).
${ctx.description}

Tu objetivo: escribir un email que haga que el dueño del negocio QUIERA responder porque ve una oportunidad clara de conseguir más clientes o más ventas.

DATOS DEL NEGOCIO:
- Nombre: ${businessName}
- Categoría: ${businessCategory || "No especificada"}
- Ciudad: ${city || "No especificada"}
- Sitio web actual: ${websiteUrl || "No tiene"}

ANÁLISIS DE SU PRESENCIA DIGITAL:
- Calificación web: ${analysis.qualityScore}/100
- Calificación SEO: ${analysis.seoScore ?? "N/A"}/100
${issueContext.map((i) => `- ${i}`).join("\n")}
- Resumen: ${analysis.summary}

SERVICIOS RECOMENDADOS PARA ESTE NEGOCIO:
${recommendedServices}

TONO DEL EMAIL: ${tone}
${stepContext}
${extraInstructions}

PRINCIPIO FUNDAMENTAL - ENFOQUE EN BENEFICIO:
El prospecto NO le importan sus problemas técnicos. Le importa tener MÁS CLIENTES y MÁS VENTAS. Cada problema que menciones debe traducirse a impacto de negocio:
- "Sin SSL" → "Los visitantes ven una alerta de 'sitio no seguro' y se van a la competencia"
- "No es responsive" → "El 70% de la gente busca desde el celular y no puede navegar bien por la página"
- "SEO bajo" → "Cuando alguien busca [su categoría] en [su ciudad], aparece la competencia y ellos no"
- "Sin web" → "Todos los clientes que buscan en Google un negocio como el suyo no los encuentran"
- "Contenido hackeado/spam" → "Google podría estar penalizando el sitio y los clientes ven contenido que daña la imagen del negocio"

ESTRUCTURA DEL EMAIL (Framework PAS orientado a beneficio):
1. HOOK (1-2 frases): Algo específico del negocio que demuestre que lo investigaste. NO halagues genéricamente.
2. OPORTUNIDAD (2-3 frases): Conecta lo que encontraste con una oportunidad concreta de crecimiento. NO listes problemas técnicos. Habla de clientes que están perdiendo o que podrían captar.
3. PRUEBA/CREDIBILIDAD (1 frase): Menciona brevemente cómo ayudas a negocios similares (sin prometer resultados exactos).
4. CTA (1 frase): Pregunta suave orientada a que el prospecto quiera saber más. Ej: "Te interesaría ver cuánto potencial tiene tu zona?" NO: "Agenda una llamada".

INSTRUCCIONES:
1. Escribe en ${localeLabel}
2. El email debe ser breve (75-125 palabras máx para inicial, 50-75 para follow-up), directo y personalizado
3. NUNCA uses jerga técnica sin traducirla a impacto de negocio. Nada de "SSL", "responsive", "SEO", "meta tags" a secas
4. Ofrece la solución más relevante (1-2 servicios máximo), pero enmarcada como RESULTADO para el negocio
5. Preséntate como "${fromName}, de ${ctx.name}". NUNCA digas "Soy ${ctx.name}" ni te presentes como si fueras la empresa
6. NO uses lenguaje de spam: nada de "gratis", "sin compromiso", "oferta", "diagnóstico gratuito". Usa alternativas naturales: "te preparo un análisis", "te muestro el potencial", "te cuento cómo funciona"
7. El email debe sentirse como si lo hubiera escrito una persona real a otra persona real
8. NUNCA uses halagos genéricos como "Me encanta lo que hacen" o "Gran proyecto"
9. El asunto debe ser corto (4-7 palabras), en sentence case, y generar curiosidad sobre el BENEFICIO, no sobre el problema
10. NO añadas ningún footer legal ni texto de baja, el sistema los inyecta automáticamente

ADAPTACIÓN REGIONAL (CRÍTICO):
El negocio está en ${city || "ubicación no especificada"}. DEBES adaptar tu lenguaje al país de ESA ciudad, NO al país de la agencia. Si la ciudad está en México, escribe en español mexicano. Si está en Argentina, en argentino. Si está en España, en español de España. Esto es OBLIGATORIO.
${writingRules}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "subject": "asunto del email",
  "bodyHtml": "contenido HTML del email con formato básico (<p>, <b>, <br>, <a>)",
  "bodyText": "versión de texto plano del email"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = cleanJsonResponse(text);
  return safeParseJSON<EmailGeneration>(jsonStr, "email");
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
  leadCountry?: string
): Promise<EmailGeneration> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const ctx = getAgencyContext();
  const effectiveCountry = leadCountry || ctx.country;
  const localeLabel = getLocaleLabel(effectiveCountry);
  const writingRules = getLocaleWritingRules(effectiveCountry);

  const prompt = `Eres un copywriter experto. Necesitas REGENERAR un email de prospección para ${ctx.name} (${ctx.url}).

DATOS DEL NEGOCIO:
- Nombre: ${businessName}
- Categoría: ${businessCategory || "No especificada"}
- Ciudad: ${city || "No especificada"}
- Web: ${websiteUrl || "No tiene"}
- Calidad web: ${analysis.qualityScore}/100
- SEO: ${analysis.seoScore ?? "N/A"}/100
- Problemas: ${analysis.issues.join(", ")}
- Oportunidades SEO: ${(analysis.seoIssues || []).join(", ")}
- Oportunidades IA: ${(analysis.aiAgentOpportunities || []).join(", ")}

EMAIL ANTERIOR:
Asunto: ${previousSubject}
Cuerpo: ${previousBody}

NUEVO TONO: ${tone}
INSTRUCCIONES ADICIONALES: ${instructions || "Solo cambia el tono"}
REMITENTE: ${fromName}, de ${ctx.name}. Preséntate SIEMPRE como "${fromName}, de ${ctx.name}". NUNCA digas "Soy ${ctx.name}".
IDIOMA: ${localeLabel}
NO añadas ningún footer legal ni texto de baja, el sistema los inyecta automáticamente.

PRINCIPIO CLAVE: El email debe enfocarse en lo que el prospecto GANA (más clientes, más ventas, más visibilidad), NO en listar problemas técnicos. Traduce cada problema a impacto de negocio. NUNCA uses jerga técnica sin explicar qué significa para sus clientes/ventas. Evita "gratis", "sin compromiso", "diagnóstico gratuito" - usa alternativas naturales.

ADAPTACIÓN REGIONAL (CRÍTICO):
El negocio está en ${city || "ubicación no especificada"}. DEBES adaptar tu lenguaje al país de ESA ciudad, NO al país de la agencia. Si la ciudad está en México, escribe en español mexicano. Si está en Argentina, en argentino. Si está en España, en español de España. Esto es OBLIGATORIO.
${writingRules}

Genera una versión diferente del email. Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "subject": "nuevo asunto",
  "bodyHtml": "nuevo contenido HTML",
  "bodyText": "nueva versión texto plano"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = cleanJsonResponse(text);
  return safeParseJSON<EmailGeneration>(jsonStr, "email-regen");
}
