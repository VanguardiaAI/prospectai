import { genAI, safeParseJSON, cleanJsonResponse, getAgencyContext, getLocaleLabel, getLocaleWritingRules, SERVICE_DEFINITIONS } from "./config";
import type { WebAnalysis, WhatsAppGeneration } from "./types";

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
  leadCountry?: string
): Promise<WhatsAppGeneration> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const ctx = getAgencyContext();
  const effectiveCountry = leadCountry || ctx.country;
  const localeLabel = getLocaleLabel(effectiveCountry);
  const writingRules = getLocaleWritingRules(effectiveCountry);

  const analysisContext = analysis
    ? `\nANÁLISIS DE SU PRESENCIA DIGITAL:
- Calificación web: ${analysis.qualityScore}/100
- Calificación SEO: ${analysis.seoScore ?? "N/A"}/100
- Problemas: ${analysis.issues.join(", ")}
- Oportunidades SEO: ${(analysis.seoIssues || []).join(", ")}
- Oportunidades IA: ${(analysis.aiAgentOpportunities || []).join(", ")}
- Servicios recomendados: ${(analysis.recommendedServices || []).map((k) => SERVICE_DEFINITIONS[k]?.label || k).join(", ")}
- Resumen: ${analysis.summary}`
    : "\nNo se ha analizado su sitio web o no tiene sitio web.";

  const stepContext = sequenceStep && sequenceStep > 1
    ? `\nEste es el FOLLOW-UP #${sequenceStep - 1}. Ya le contactaste antes. Sé más breve y directo. Cambia el ángulo. Puedes hacer referencia a que ya le escribiste.`
    : "";

  const extraInstructions = customInstructions ? `\nINSTRUCCIONES ADICIONALES: ${customInstructions}` : "";

  const prompt = `Eres un experto en ventas B2B escribiendo un mensaje de WhatsApp para prospectar un negocio para ${ctx.name} (${ctx.url}).
${ctx.description}

DATOS DEL NEGOCIO:
- Nombre: ${businessName}
- Categoría: ${businessCategory || "No especificada"}
- Ciudad: ${city || "No especificada"}
- Sitio web actual: ${websiteUrl || "No tiene"}
${analysisContext}

TONO: ${tone}
REMITENTE: ${fromName} de ${ctx.name}
${stepContext}
${extraInstructions}

OBJETIVO PRINCIPAL DEL MENSAJE:
El prospecto tiene que sentir que GANA algo hablando contigo. No le estás auditando ni señalando errores: le estás mostrando cómo puede conseguir MÁS CLIENTES o MÁS VENTAS. Cada problema técnico que menciones debe conectarse con un beneficio tangible para su negocio.

ESTRUCTURA DEL MENSAJE:
1. APERTURA (1 línea): Saludo natural + quién eres. Breve.
2. GANCHO DE VALOR (1-2 líneas): Algo específico de su negocio conectado con una OPORTUNIDAD de crecimiento. NO listes problemas técnicos. Traduce cada problema a lo que significa en clientes o ventas.
3. PROPUESTA (1 línea): Qué le ofreces concretamente y qué va a conseguir con ello.
4. CIERRE (1 línea): Pregunta abierta natural que invite a responder.

EJEMPLOS DE BUEN MENSAJE vs MAL MENSAJE:

MAL (suena a spam, lista problemas, no dice qué gana):
"Hola. Soy Álex, de ${ctx.name}, y hemos visto vuestra web en La Chata de Guadalajara. Hemos notado que tiene contenido de casinos ajeno a vuestro negocio, algo crítico por seguridad y para vuestra imagen online. Además, carece de certificados SSL y no está adaptada a móviles. Podemos ofrecerte un diagnóstico gratuito para ver cómo optimizarla y asegurar vuestra presencia digital. ¿Te gustaría que lo analizáramos sin compromiso?"

Por qué es malo: usa "vuestra" (España) para un negocio mexicano, lista problemas técnicos que no entiende el dueño, no dice qué gana, "diagnóstico gratuito" suena a spam, usa ¿ en WhatsApp.

BIEN (conversacional, enfocado en beneficio, adaptado a región):
"Hola, soy Álex de ${ctx.name}. Vi La Chata de Guadalajara y la verdad es que se ve que tienen muy buena propuesta gastronómica. Me di cuenta de que su web podría estar alejando clientes en lugar de atraerlos, sobre todo desde el celular que es donde busca la gente hoy. Ayudamos a restaurantes como el suyo a que les lleguen más comensales por internet. Te puedo armar un análisis rápido para que veas el potencial, te interesa?"

Por qué es bueno: habla de "su" no "vuestra", dice "celular" no "móvil", conecta el problema con PERDER CLIENTES, ofrece ver "el potencial" (positivo), cierra natural sin ¿.

OTRO BUEN EJEMPLO (negocio sin web):
"Hola, soy Álex de ${ctx.name}. Busqué La Chata de Guadalajara en internet y no encontré una web del negocio. Eso significa que todos los clientes que buscan taquerías en Google no los están encontrando a ustedes, se están yendo a la competencia. Ayudamos a negocios gastronómicos a captar esos clientes con una presencia web que de verdad genere visitas. Quieres que te cuente cómo funciona?"

REGLAS PARA EL MENSAJE:
1. Escribe en ${localeLabel}
2. Máximo 500 caracteres. WhatsApp es conversacional, no formal
3. SIEMPRE traduce problemas técnicos a IMPACTO DE NEGOCIO: "sin SSL" → "los clientes ven una alerta de sitio no seguro y se van", "no es responsive" → "la gente que busca desde el celular no puede ver bien tu página y se va a la competencia"
4. NUNCA uses jerga técnica sin explicar qué significa para su bolsillo: nada de "SSL", "responsive", "SEO", "meta tags" a secas. Si mencionas algo técnico, explica el impacto en clientes/ventas
5. El beneficio siempre es: más clientes, más visitas, más ventas, mejor imagen, que no pierdan clientes ante la competencia
6. Si no tiene web o es de baja calidad, mencionalo como oportunidad de CRECIMIENTO, nunca como crítica
7. Ofrece algo concreto enfocado en el resultado: "ver cuántos clientes podrían estar captando", "análisis del potencial de tu zona", NO "diagnóstico gratuito" ni "auditoría" que suena a vendedor
8. NO uses HTML, NO uses formatos de email
9. NO uses emojis excesivos (máximo 1-2 si el tono lo permite)
10. Firma solo con el nombre, sin links ni datos adicionales
11. Debe sonar como un mensaje real de WhatsApp que le mandarías a un conocido profesional, no copy publicitario
12. Preséntate como "${fromName}, de ${ctx.name}". NUNCA digas "Soy ${ctx.name}" ni te presentes como la empresa
13. NO incluyas URLs, links ni dominios en el mensaje. Favorecen la detección de spam y el bloqueo del número
14. NUNCA uses signo de interrogación de apertura (¿). En WhatsApp nadie lo usa
15. NUNCA digas "sin compromiso", "gratuito", "gratis", "diagnóstico gratuito". Suena a telemarketing. Usa alternativas naturales: "te puedo armar un análisis", "te cuento cómo funciona", "te muestro el potencial"

ADAPTACIÓN REGIONAL (CRÍTICO):
El negocio está en ${city || "ubicación no especificada"}. DEBES adaptar tu lenguaje al país de ESA ciudad, NO al país de la agencia. Si la ciudad está en México, escribe en español mexicano. Si está en Argentina, en argentino. Si está en España, en español de España. Esto es OBLIGATORIO.
${writingRules}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "message": "el mensaje de whatsapp"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = cleanJsonResponse(text);
  return safeParseJSON<WhatsAppGeneration>(jsonStr, "whatsapp");
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
  leadCountry?: string
): Promise<WhatsAppGeneration> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const ctx = getAgencyContext();
  const effectiveCountry = leadCountry || ctx.country;
  const localeLabel = getLocaleLabel(effectiveCountry);
  const writingRules = getLocaleWritingRules(effectiveCountry);

  const prompt = `Eres un experto en ventas B2B. Necesitas REGENERAR un mensaje de WhatsApp de prospección para ${ctx.name} (${ctx.url}).

DATOS DEL NEGOCIO:
- Nombre: ${businessName}
- Categoría: ${businessCategory || "No especificada"}
- Ciudad: ${city || "No especificada"}
- Web: ${websiteUrl || "No tiene"}

MENSAJE ANTERIOR:
${previousMessage}

NUEVO TONO: ${tone}
INSTRUCCIONES: ${instructions || "Solo cambia el tono"}
REMITENTE: ${fromName}, de ${ctx.name}. Preséntate como "${fromName}, de ${ctx.name}". NUNCA digas "Soy ${ctx.name}".
IDIOMA: ${localeLabel}

REGLAS: Máximo 500 caracteres, conversacional, sin HTML, sin emojis excesivos, que suene como WhatsApp real. Enfócate en lo que el prospecto GANA (más clientes, más ventas), no en listar problemas técnicos. Traduce cada problema a impacto de negocio. NUNCA uses "gratis", "sin compromiso", "diagnóstico gratuito". NUNCA uses jerga técnica sin explicar qué pierde el negocio. NUNCA uses ¿ (nadie lo usa en WhatsApp). Puede hablar de web, SEO, IA, Google Business o redes según lo que sea más relevante. NO incluyas URLs, links ni dominios en el mensaje.

ADAPTACIÓN REGIONAL (CRÍTICO):
El negocio está en ${city || "ubicación no especificada"}. DEBES adaptar tu lenguaje al país de ESA ciudad, NO al país de la agencia. Si la ciudad está en México, escribe en español mexicano. Si está en Argentina, en argentino. Si está en España, en español de España. Esto es OBLIGATORIO.
${writingRules}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "message": "nuevo mensaje de whatsapp"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = cleanJsonResponse(text);
  return safeParseJSON<WhatsAppGeneration>(jsonStr, "wa-regen");
}
