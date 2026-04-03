import { GoogleGenerativeAI } from "@google/generative-ai";
import { getSetting } from "@/db";

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// --- Service definitions ---

export const SERVICE_DEFINITIONS: Record<string, { label: string; description: string }> = {
  web_development: {
    label: "Desarrollo Web",
    description: "Diseño y desarrollo de sitios web profesionales, landing pages, e-commerce y aplicaciones web",
  },
  seo: {
    label: "SEO y Posicionamiento",
    description: "Optimización para motores de búsqueda, auditoría SEO, estrategia de contenidos y posicionamiento orgánico",
  },
  ai_agents: {
    label: "Agentes IA / Chatbots",
    description: "Asistentes virtuales con IA para atención al cliente, reservas, FAQ automatizadas y automatización de procesos",
  },
  google_business: {
    label: "Google Business Profile",
    description: "Optimización de ficha de Google, gestión de reseñas, fotos, publicaciones y posicionamiento local",
  },
  social_media: {
    label: "Redes Sociales",
    description: "Gestión de redes sociales, estrategia de contenido, publicidad en Meta/TikTok y community management",
  },
};

export function getEnabledServices(): { key: string; label: string; description: string }[] {
  const raw = getSetting("agency_services") || "web_development";
  return raw.split(",").map((s) => s.trim()).filter(Boolean).map((key) => ({
    key,
    label: SERVICE_DEFINITIONS[key]?.label || key,
    description: SERVICE_DEFINITIONS[key]?.description || key,
  }));
}

// --- Agency context helper ---

interface AgencyContext {
  name: string;
  url: string;
  description: string;
  services: { key: string; label: string; description: string }[];
  country: string;
  locale: string;
}

function getAgencyContext(): AgencyContext {
  return {
    name: getSetting("agency_name") || "VanguardIA",
    url: getSetting("agency_url") || "vanguardia.dev",
    description: getSetting("agency_description") || "Agencia de desarrollo web y soluciones digitales",
    services: getEnabledServices(),
    country: getSetting("target_country") || "ES",
    locale: getSetting("locale") || "es-ES",
  };
}

function getLocaleLabel(country: string): string {
  const map: Record<string, string> = {
    ES: "español (España)",
    MX: "español (México)",
    AR: "español (Argentina)",
    CO: "español (Colombia)",
    CL: "español (Chile)",
    PE: "español (Perú)",
    EC: "español (Ecuador)",
    UY: "español (Uruguay)",
    US: "inglés (Estados Unidos)",
    UK: "inglés (Reino Unido)",
    CA: "inglés (Canadá)",
    AU: "inglés (Australia)",
    BR: "portugués (Brasil)",
    PT: "portugués (Portugal)",
    FR: "francés (Francia)",
    DE: "alemán (Alemania)",
    IT: "italiano (Italia)",
    NL: "neerlandés (Países Bajos)",
  };
  return map[country] || "español";
}

function getLocaleWritingRules(country: string): string {
  const formatting = `- NUNCA uses em dash (—) ni guion largo. Usa comas, puntos o guiones cortos (-) para separar ideas.
- NUNCA uses signo de exclamación de apertura (¡). Solo usa el de cierre (!) cuando sea estrictamente necesario.
- NUNCA uses signo de interrogación de apertura (¿) en mensajes de WhatsApp. En WhatsApp nadie lo usa, queda robótico. Solo usa el de cierre (?). En emails sí puedes usarlo si la región lo requiere.
- Preséntate SIEMPRE como una persona real: "Soy [nombre], de [empresa]". NUNCA digas "Soy [empresa]" ni te presentes como si fueras la empresa misma.
- Escribe de forma natural y humana. Evita construcciones rígidas o que suenen a copy publicitario.
- SIEMPRE conecta cualquier problema detectado con un IMPACTO DE NEGOCIO concreto: pérdida de clientes, menos ventas, peor visibilidad, etc. NUNCA listes problemas técnicos sin explicar qué pierde el negocio por eso.`;

  const regional: Record<string, string> = {
    ES: `- Región: España. Usa "tú" y "vosotros" de forma natural.
- El registro debe sonar como un profesional español hablando a otro profesional.`,
    MX: `- Región: México. Usa "tú" y "ustedes". NUNCA uses "vosotros", "habéis", "tenéis", "hacéis", "podéis" ni NINGUNA forma verbal con -éis/-áis.
- No uses modismos de España: "mola", "tío", "vale" (como afirmación), "quedamos", "currar", "genial" en exceso.
- El registro debe sonar como un profesional mexicano hablando a otro profesional mexicano.`,
    AR: `- Región: Argentina. Usa "vos" y "ustedes". NUNCA uses "vosotros" ni "tú".
- Conjugaciones de voseo: "tenés", "sabés", "podés", "querés".
- El registro debe sonar como un profesional argentino hablando a otro profesional.`,
    CO: `- Región: Colombia. Usa "tú" o "usted" y "ustedes". NUNCA uses "vosotros".
- El registro debe sonar como un profesional colombiano hablando a otro profesional.`,
    CL: `- Región: Chile. Usa "tú" y "ustedes". NUNCA uses "vosotros".
- El registro debe sonar como un profesional chileno hablando a otro profesional.`,
    PE: `- Región: Perú. Usa "tú" o "usted" y "ustedes". NUNCA uses "vosotros".
- El registro debe sonar como un profesional peruano hablando a otro profesional.`,
    EC: `- Región: Ecuador. Usa "tú" o "usted" y "ustedes". NUNCA uses "vosotros".
- El registro debe sonar como un profesional ecuatoriano hablando a otro profesional.`,
    UY: `- Región: Uruguay. Usa "tú" o "vos" y "ustedes". NUNCA uses "vosotros".
- El registro debe sonar como un profesional uruguayo hablando a otro profesional.`,
    US: `- Region: United States. Write in casual professional American English.`,
    UK: `- Region: United Kingdom. Write in professional British English.`,
    CA: `- Region: Canada. Write in professional Canadian English.`,
    AU: `- Region: Australia. Write in professional Australian English.`,
    BR: `- Região: Brasil. Escreva em português brasileiro profissional. NUNCA use português europeu.`,
    PT: `- Região: Portugal. Escreva em português europeu profissional.`,
    FR: `- Région: France. Écrivez en français professionnel.`,
    DE: `- Region: Deutschland. Schreiben Sie in professionellem Deutsch.`,
    IT: `- Regione: Italia. Scrivi in italiano professionale.`,
    NL: `- Regio: Nederland. Schrijf in professioneel Nederlands.`,
  };

  return `${formatting}\n${regional[country] || ""}`;
}

// --- Interfaces ---

export interface WebAnalysis {
  hasWebsite: boolean;
  qualityScore: number; // 0-100
  issues: string[];
  strengths: string[];
  summary: string;
  isMobile: boolean;
  hasSSL: boolean;
  loadSpeed: "fast" | "medium" | "slow" | "unknown";
  designScore: number;
  contentScore: number;
  functionalityScore: number;
  extractedEmails: string[];
  // Multi-service analysis
  seoScore: number; // 0-100
  seoIssues: string[];
  googleBusinessOpportunities: string[];
  socialMediaPresence: string[];
  aiAgentOpportunities: string[];
  recommendedServices: string[]; // keys from SERVICE_DEFINITIONS
}

export interface EmailGeneration {
  subject: string;
  bodyHtml: string;
  bodyText: string;
}

export interface WhatsAppGeneration {
  message: string;
}

// --- Analysis ---

export async function analyzeWebsite(
  businessName: string,
  businessCategory: string | null,
  websiteUrl: string,
  scrapedContent: string,
  scrapedMeta: Record<string, string>
): Promise<WebAnalysis> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const ctx = getAgencyContext();
  const localeLabel = getLocaleLabel(ctx.country);
  const servicesDesc = ctx.services.map((s) => `- ${s.label}: ${s.description}`).join("\n");

  const prompt = `Eres un experto en marketing digital y desarrollo web evaluando la presencia online de un negocio.

NEGOCIO: ${businessName}
CATEGORÍA: ${businessCategory || "No especificada"}
URL: ${websiteUrl}
PAÍS OBJETIVO: ${ctx.country}

CONTENIDO DEL SITIO (primeros 3000 caracteres):
${scrapedContent.substring(0, 3000)}

META INFORMACIÓN:
${JSON.stringify(scrapedMeta, null, 2)}

SERVICIOS QUE OFRECEMOS COMO AGENCIA:
${servicesDesc}

Evalúa el sitio web Y la presencia digital general del negocio. Responde en ${localeLabel}. Responde SOLO con un JSON válido (sin markdown, sin backticks):
{
  "hasWebsite": true,
  "qualityScore": <0-100 donde 0=terrible y 100=excelente>,
  "issues": ["lista de problemas encontrados en la web"],
  "strengths": ["lista de cosas buenas si las hay"],
  "summary": "resumen breve de la calidad del sitio y presencia digital",
  "isMobile": <true/false si parece responsive>,
  "hasSSL": <true/false>,
  "loadSpeed": "<fast|medium|slow|unknown>",
  "designScore": <0-100>,
  "contentScore": <0-100>,
  "functionalityScore": <0-100>,
  "extractedEmails": ["emails encontrados en el contenido"],
  "seoScore": <0-100 evaluando título, meta description, headings, contenido, URLs amigables>,
  "seoIssues": ["problemas SEO específicos: falta meta description, sin H1, contenido thin, etc."],
  "googleBusinessOpportunities": ["oportunidades de mejora en Google Business: sin ficha, ficha incompleta, pocas reseñas, sin fotos, etc."],
  "socialMediaPresence": ["lo que se detecta de redes sociales: links encontrados, ausencia de redes, etc."],
  "aiAgentOpportunities": ["oportunidades para IA: necesita chatbot, FAQs que se podrían automatizar, sistema de reservas, atención 24/7, etc."],
  "recommendedServices": ["lista de keys de servicios recomendados de entre: ${ctx.services.map((s) => s.key).join(", ")}"]
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();

  // Parse JSON - handle potential markdown wrapping
  const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  const parsed = JSON.parse(jsonStr) as WebAnalysis;

  // Ensure backwards compatibility with defaults for new fields
  return {
    ...parsed,
    seoScore: parsed.seoScore ?? 50,
    seoIssues: parsed.seoIssues ?? [],
    googleBusinessOpportunities: parsed.googleBusinessOpportunities ?? [],
    socialMediaPresence: parsed.socialMediaPresence ?? [],
    aiAgentOpportunities: parsed.aiAgentOpportunities ?? [],
    recommendedServices: parsed.recommendedServices ?? ["web_development"],
  };
}

// --- Email generation ---

export async function generateEmail(
  businessName: string,
  businessCategory: string | null,
  city: string | null,
  websiteUrl: string | null,
  analysis: WebAnalysis,
  tone: string,
  fromName: string,
  sequenceStep?: number,
  customInstructions?: string
): Promise<EmailGeneration> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const ctx = getAgencyContext();
  const localeLabel = getLocaleLabel(ctx.country);
  const writingRules = getLocaleWritingRules(ctx.country);

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

REGLAS DE ESCRITURA Y ADAPTACIÓN REGIONAL (OBLIGATORIAS):
${writingRules}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "subject": "asunto del email",
  "bodyHtml": "contenido HTML del email con formato básico (<p>, <b>, <br>, <a>)",
  "bodyText": "versión de texto plano del email"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr) as EmailGeneration;
}

// --- Email regeneration ---

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
  instructions: string
): Promise<EmailGeneration> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const ctx = getAgencyContext();
  const localeLabel = getLocaleLabel(ctx.country);
  const writingRules = getLocaleWritingRules(ctx.country);

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

REGLAS DE ESCRITURA Y ADAPTACIÓN REGIONAL (OBLIGATORIAS):
${writingRules}

Genera una versión diferente del email. Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "subject": "nuevo asunto",
  "bodyHtml": "nuevo contenido HTML",
  "bodyText": "nueva versión texto plano"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr) as EmailGeneration;
}

// --- WhatsApp generation ---

export async function generateWhatsApp(
  businessName: string,
  businessCategory: string | null,
  city: string | null,
  websiteUrl: string | null,
  analysis: WebAnalysis | null,
  tone: string,
  fromName: string,
  sequenceStep?: number,
  customInstructions?: string
): Promise<WhatsAppGeneration> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const ctx = getAgencyContext();
  const localeLabel = getLocaleLabel(ctx.country);
  const writingRules = getLocaleWritingRules(ctx.country);

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
"Hola. Soy Álex, de VanguardIA, y hemos visto vuestra web en La Chata de Guadalajara. Hemos notado que tiene contenido de casinos ajeno a vuestro negocio, algo crítico por seguridad y para vuestra imagen online. Además, carece de certificados SSL y no está adaptada a móviles. Podemos ofrecerte un diagnóstico gratuito para ver cómo optimizarla y asegurar vuestra presencia digital. ¿Te gustaría que lo analizáramos sin compromiso?"

Por qué es malo: usa "vuestra" (España) para un negocio mexicano, lista problemas técnicos que no entiende el dueño, no dice qué gana, "diagnóstico gratuito" suena a spam, usa ¿ en WhatsApp.

BIEN (conversacional, enfocado en beneficio, adaptado a región):
"Hola, soy Álex de VanguardIA. Vi La Chata de Guadalajara y la verdad es que se ve que tienen muy buena propuesta gastronómica. Me di cuenta de que su web podría estar alejando clientes en lugar de atraerlos, sobre todo desde el celular que es donde busca la gente hoy. Ayudamos a restaurantes como el suyo a que les lleguen más comensales por internet. Te puedo armar un análisis rápido para que veas el potencial, te interesa?"

Por qué es bueno: habla de "su" no "vuestra", dice "celular" no "móvil", conecta el problema con PERDER CLIENTES, ofrece ver "el potencial" (positivo), cierra natural sin ¿.

OTRO BUEN EJEMPLO (negocio sin web):
"Hola, soy Álex de VanguardIA. Busqué La Chata de Guadalajara en internet y no encontré una web del negocio. Eso significa que todos los clientes que buscan taquerías en Google no los están encontrando a ustedes, se están yendo a la competencia. Ayudamos a negocios gastronómicos a captar esos clientes con una presencia web que de verdad genere visitas. Quieres que te cuente cómo funciona?"

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

REGLAS DE ESCRITURA Y ADAPTACIÓN REGIONAL (OBLIGATORIAS):
${writingRules}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "message": "el mensaje de whatsapp"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr) as WhatsAppGeneration;
}

// --- Template generation ---

export interface TemplateGeneration {
  name: string;
  subject: string;
  bodyHtml: string;
  bodyText: string;
  variables: string[];
}

export interface WhatsAppTemplateGeneration {
  name: string;
  message: string;
  variables: string[];
}

export async function generateEmailTemplate(
  industry: string,
  purpose: "initial" | "follow_up" | "breakup",
  tone: string,
  customInstructions?: string
): Promise<TemplateGeneration> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const ctx = getAgencyContext();
  const localeLabel = getLocaleLabel(ctx.country);
  const writingRules = getLocaleWritingRules(ctx.country);
  const servicesDesc = ctx.services.map((s) => `- ${s.label}: ${s.description}`).join("\n");

  const purposeMap = {
    initial: "Primer contacto, email inicial de prospección fría",
    follow_up: "Follow-up, segundo o tercer contacto, ángulo diferente, más breve",
    breakup: "Breakup, último mensaje de la secuencia, despedida cordial",
  };

  const wordLimits = {
    initial: "75-125 palabras",
    follow_up: "50-75 palabras",
    breakup: "40-60 palabras",
  };

  const prompt = `Eres un experto en cold email B2B y copywriting para ${ctx.name} (${ctx.url}).
${ctx.description}

GENERA UN TEMPLATE DE EMAIL reutilizable para la industria: "${industry}"
PROPÓSITO: ${purposeMap[purpose]}
TONO: ${tone}
IDIOMA: ${localeLabel}
${customInstructions ? `INSTRUCCIONES ADICIONALES: ${customInstructions}` : ""}

SERVICIOS QUE OFRECEMOS:
${servicesDesc}

PRINCIPIO FUNDAMENTAL - ENFOQUE EN BENEFICIO:
El dueño de negocio NO le importan problemas técnicos. Le importa tener MÁS CLIENTES y MÁS VENTAS. Todo problema debe traducirse a impacto de negocio:
- "Sin SSL" → "Los visitantes ven 'sitio no seguro' y se van a la competencia"
- "No responsive" → "El 70% busca desde el celular y no puede navegar bien por la página"
- "SEO bajo" → "Cuando buscan {{category}} en {{city}}, sale la competencia y ellos no"
- "Sin web" → "Los clientes que buscan en Google no los encuentran"

REGLAS CRÍTICAS DE ANTI-SPAM Y MEJORES PRÁCTICAS (2026):
1. LONGITUD: ${wordLimits[purpose]}. Los emails de más de 150 palabras tienen tasas de respuesta significativamente menores.
2. FORMATO: Texto plano con HTML mínimo (solo <p>, <br>, <b>). SIN imágenes, SIN colores, SIN headers HTML.
3. ASUNTO: 4-7 palabras, sentence case, que genere curiosidad sobre el BENEFICIO, no sobre el problema. Ej: "más clientes para {{business_name}}" NO "problemas en tu web".
4. PALABRAS SPAM PROHIBIDAS: gratis, oferta, garantizado, exclusivo, urgente, actúa ahora, descuento, sin coste, oportunidad única, resultados garantizados, dinero, beneficio, promoción, click aquí, sin compromiso, diagnóstico gratuito.
5. USA ALTERNATIVAS NATURALES: "te preparo un análisis" en vez de "diagnóstico gratuito", "te muestro el potencial" en vez de "oferta exclusiva", "te cuento cómo funciona" en vez de "sin compromiso".
6. PERSONALIZACIÓN: Usa variables {{variable}}. MÍNIMO: {{business_name}} y una referencia específica al negocio.
7. UN SOLO CTA: Pregunta suave orientada al beneficio. Ej: "Te interesaría ver cuánto potencial tiene tu zona?" NO "Agenda una demo ahora".
8. ESTRUCTURA (Framework PAS orientado a beneficio):
   - HOOK: 1-2 frases que demuestren que investigaste el negocio. SIN halagos genéricos.
   - OPORTUNIDAD: 2-3 frases conectando lo detectado con clientes/ventas que podrían captar. NUNCA listes problemas técnicos a secas.
   - CREDIBILIDAD: 1 frase sobre cómo ayudas a negocios similares (sin prometer cifras exactas).
   - CTA: 1 frase, pregunta suave sobre el beneficio.
9. FIRMA: Solo "{{sender_name}}, de ${ctx.name}". NUNCA "Soy ${ctx.name}". NO añadas footer legal ni link de baja (el sistema los inyecta).
10. VARIACIÓN: El template debe sonar natural y humano, NO como un copy publicitario.
11. PARA FOLLOW-UP: Cambia el ángulo. Si el inicial habla de web, el follow-up habla de SEO o IA. Más breve y directo.
12. PARA BREAKUP: Despedida cordial, deja la puerta abierta, sin culpa ni presión.
13. CUMPLIMIENTO LEGAL: El email debe poder identificarse como comunicación comercial. Remitente claramente identificado.
14. NUNCA uses halagos genéricos como "Me encanta lo que hacéis" o "Me encanta lo que hacen".
15. NUNCA prometas resultados exactos, usa lenguaje como "ayudamos a", "conseguimos que".
16. NUNCA uses jerga técnica sin traducirla a impacto: nada de "SSL", "responsive", "SEO" a secas. Siempre explica qué significa para sus clientes/ventas.

REGLAS DE ESCRITURA Y ADAPTACIÓN REGIONAL (OBLIGATORIAS):
${writingRules}

VARIABLES DISPONIBLES para usar en el template:
- {{business_name}}: nombre del negocio
- {{category}}: categoría/industria del negocio
- {{city}}: ciudad del negocio
- {{website}}: sitio web del negocio
- {{issue}}: problema específico detectado en su presencia digital
- {{sender_name}}: nombre del remitente
- {{service}}: servicio recomendado

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "name": "nombre descriptivo corto del template",
  "subject": "asunto del email con {{variables}} si aplica",
  "bodyHtml": "contenido HTML mínimo del email (<p>, <b>, <br>)",
  "bodyText": "versión texto plano del email",
  "variables": ["lista", "de", "variables", "usadas"]
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr) as TemplateGeneration;
}

export async function generateWhatsAppTemplate(
  industry: string,
  purpose: "initial" | "follow_up" | "breakup",
  tone: string,
  customInstructions?: string
): Promise<WhatsAppTemplateGeneration> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const ctx = getAgencyContext();
  const localeLabel = getLocaleLabel(ctx.country);
  const writingRules = getLocaleWritingRules(ctx.country);
  const servicesDesc = ctx.services.map((s) => `- ${s.label}: ${s.description}`).join("\n");

  const purposeMap = {
    initial: "Primer contacto, mensaje inicial de prospección",
    follow_up: "Follow-up, segundo contacto, ángulo diferente, más breve",
    breakup: "Breakup, último mensaje, despedida cordial",
  };

  const prompt = `Eres un experto en ventas B2B por WhatsApp para ${ctx.name} (${ctx.url}).
${ctx.description}

GENERA UN TEMPLATE DE WHATSAPP reutilizable para la industria: "${industry}"
PROPÓSITO: ${purposeMap[purpose]}
TONO: ${tone}
IDIOMA: ${localeLabel}
${customInstructions ? `INSTRUCCIONES ADICIONALES: ${customInstructions}` : ""}

SERVICIOS QUE OFRECEMOS:
${servicesDesc}

PRINCIPIO FUNDAMENTAL - ENFOQUE EN BENEFICIO:
El prospecto tiene que sentir que GANA algo. No le audites ni señales errores: muéstrale cómo puede conseguir MÁS CLIENTES o MÁS VENTAS. Traduce cada problema técnico a impacto de negocio:
- "Sin web" → "los clientes que buscan en Google no te encuentran, se van a la competencia"
- "Web lenta/mal" → "la gente entra, no carga bien y se va"
- "Sin presencia en redes" → "tus competidores están captando a tus clientes potenciales ahí"

REGLAS PARA WHATSAPP B2B (2026):
1. MÁXIMO 500 caracteres. WhatsApp es conversacional, no formal.
2. Saludo breve y natural, como si hablaras con alguien en persona.
3. SIEMPRE traduce problemas a IMPACTO DE NEGOCIO: clientes que pierden, ventas que no llegan, competencia que les gana.
4. NUNCA uses jerga técnica sin explicar qué pierde el negocio: nada de "SSL", "responsive", "SEO" a secas.
5. Si el negocio no tiene web o es de baja calidad, mencionalo como OPORTUNIDAD de crecimiento, no como crítica.
6. Ofrece algo enfocado en resultado: "ver cuántos clientes podrían captar", "análisis del potencial de tu zona". NUNCA "diagnóstico gratuito", "sin compromiso", "gratis".
7. Cierra con pregunta abierta natural para generar respuesta. SIN signo de apertura (¿), solo cierre (?).
8. SIN HTML, SIN formato de email.
9. MÁXIMO 1-2 emojis si el tono lo permite. Preferiblemente 0.
10. Firma: "{{sender_name}}, de ${ctx.name}". NUNCA "Soy ${ctx.name}". Sin links, URLs ni dominios.
11. Debe sonar como un mensaje real de WhatsApp a un conocido profesional, NO como copy publicitario.
12. PROHIBIDO: lenguaje de spam, promesas exageradas, urgencia artificial, "oferta por tiempo limitado", "sin compromiso".
13. USA ALTERNATIVAS NATURALES: "te comento" en vez de "te informo", "vi que" en vez de "he observado", "qué te parece" en vez de "le interesaría".
14. Para FOLLOW-UP: Referencia al mensaje anterior. Más breve. Nuevo ángulo de valor.
15. Para BREAKUP: Cordial, sin presión, deja la puerta abierta.
16. ANTI-BLOQUEO: Los mensajes repetitivos o demasiado comerciales provocan reportes y bloqueo del número. Naturalidad ante todo.
17. PERSONALIZACIÓN: Usa variables {{variable}} para hacer el mensaje específico al prospecto.
18. NO incluyas URLs, links ni dominios en el mensaje. Favorecen detección de spam y bloqueo del número.

REGLAS DE ESCRITURA Y ADAPTACIÓN REGIONAL (OBLIGATORIAS):
${writingRules}

VARIABLES DISPONIBLES:
- {{business_name}}: nombre del negocio
- {{category}}: categoría/industria
- {{city}}: ciudad
- {{issue}}: problema detectado
- {{sender_name}}: nombre del remitente
- {{service}}: servicio recomendado

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "name": "nombre descriptivo corto del template",
  "message": "el mensaje de whatsapp con {{variables}}",
  "variables": ["lista", "de", "variables", "usadas"]
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr) as WhatsAppTemplateGeneration;
}

// --- WhatsApp regeneration ---

export async function regenerateWhatsApp(
  businessName: string,
  businessCategory: string | null,
  city: string | null,
  websiteUrl: string | null,
  analysis: WebAnalysis | null,
  tone: string,
  fromName: string,
  previousMessage: string,
  instructions: string
): Promise<WhatsAppGeneration> {
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
  const ctx = getAgencyContext();
  const localeLabel = getLocaleLabel(ctx.country);
  const writingRules = getLocaleWritingRules(ctx.country);

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

REGLAS DE ESCRITURA Y ADAPTACIÓN REGIONAL (OBLIGATORIAS):
${writingRules}

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "message": "nuevo mensaje de whatsapp"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr) as WhatsAppGeneration;
}
