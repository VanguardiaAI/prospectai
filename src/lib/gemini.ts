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

Tu objetivo es escribir un email personalizado para contactar a un negocio que podría beneficiarse de nuestros servicios.

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

INSTRUCCIONES:
1. Escribe en ${localeLabel}
2. El email debe ser breve, directo y personalizado para este negocio específico
3. Menciona problemas ESPECÍFICOS detectados (no genéricos) — puede ser web, SEO, Google Business, redes sociales o IA
4. Ofrece la solución más relevante según los servicios recomendados (NO menciones todos, elige 1-2 máximo)
5. El remitente es ${fromName} de ${ctx.name}
6. NO uses lenguaje de spam ni promesas exageradas
7. El email debe sentirse como si lo hubiera escrito una persona real
8. Incluye un CTA claro pero no presionante
9. NO añadas ningún footer legal ni texto de baja — el sistema los inyecta automáticamente

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
REMITENTE: ${fromName} de ${ctx.name}
IDIOMA: ${localeLabel}
NO añadas ningún footer legal ni texto de baja — el sistema los inyecta automáticamente.

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

REGLAS PARA EL MENSAJE DE WHATSAPP:
1. Escribe en ${localeLabel}
2. Máximo 500 caracteres. WhatsApp es conversacional, no formal
3. Saludo breve y natural, como si hablaras con alguien en persona
4. Ve al punto rápido: menciona algo ESPECÍFICO de su negocio o su presencia digital
5. Si no tiene web o es de baja calidad, mencionalo como oportunidad, NO como crítica
6. Ofrece algo concreto (diagnóstico gratis, propuesta sin compromiso)
7. Cierra con una pregunta abierta para generar respuesta
8. NO uses HTML, NO uses formatos de email
9. NO uses emojis excesivos (máximo 1-2 si el tono lo permite)
10. Firma solo con el nombre, sin links ni datos adicionales
11. Debe sonar como un mensaje real de WhatsApp, no un copy publicitario
12. Puedes hablar de cualquier servicio relevante (web, SEO, IA, Google Business, redes) según lo que más necesite el negocio

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "message": "el mensaje de whatsapp"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr) as WhatsAppGeneration;
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
REMITENTE: ${fromName} de ${ctx.name}
IDIOMA: ${localeLabel}

REGLAS: Máximo 500 caracteres, conversacional, sin HTML, sin emojis excesivos, que suene como WhatsApp real. Puede hablar de web, SEO, IA, Google Business o redes según lo que sea más relevante.

Responde SOLO con JSON válido (sin markdown, sin backticks):
{
  "message": "nuevo mensaje de whatsapp"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr) as WhatsAppGeneration;
}
