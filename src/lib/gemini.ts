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
- Preséntate SIEMPRE como una persona real: "Soy [nombre], de [empresa]". NUNCA digas "Soy [empresa]" ni te presentes como si fueras la empresa misma.
- Escribe de forma natural y humana. Evita construcciones rígidas o que suenen a copy publicitario.`;

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
3. Menciona problemas ESPECÍFICOS detectados (no genéricos), ya sea de web, SEO, Google Business, redes sociales o IA
4. Ofrece la solución más relevante según los servicios recomendados (NO menciones todos, elige 1-2 máximo)
5. Preséntate como "${fromName}, de ${ctx.name}". NUNCA digas "Soy ${ctx.name}" ni te presentes como si fueras la empresa
6. NO uses lenguaje de spam ni promesas exageradas
7. El email debe sentirse como si lo hubiera escrito una persona real
8. Incluye un CTA claro pero no presionante
9. NO añadas ningún footer legal ni texto de baja, el sistema los inyecta automáticamente

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

REGLAS PARA EL MENSAJE DE WHATSAPP:
1. Escribe en ${localeLabel}
2. Máximo 500 caracteres. WhatsApp es conversacional, no formal
3. Saludo breve y natural, como si hablaras con alguien en persona
4. Ve al punto rápido: menciona algo ESPECÍFICO de su negocio o su presencia digital
5. Si no tiene web o es de baja calidad, mencionalo como oportunidad, NO como crítica
6. Ofrece algo concreto (diagnóstico complementario, propuesta personalizada)
7. Cierra con una pregunta abierta para generar respuesta
8. NO uses HTML, NO uses formatos de email
9. NO uses emojis excesivos (máximo 1-2 si el tono lo permite)
10. Firma solo con el nombre, sin links ni datos adicionales
11. Debe sonar como un mensaje real de WhatsApp, no un copy publicitario
12. Puedes hablar de cualquier servicio relevante (web, SEO, IA, Google Business, redes) según lo que más necesite el negocio
13. Preséntate como "${fromName}, de ${ctx.name}". NUNCA digas "Soy ${ctx.name}" ni te presentes como la empresa
14. NO incluyas URLs, links ni dominios en el mensaje. Favorecen la detección de spam y el bloqueo del número

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

REGLAS CRÍTICAS DE ANTI-SPAM Y MEJORES PRÁCTICAS (2026):
1. LONGITUD: ${wordLimits[purpose]}. Los emails de más de 150 palabras tienen tasas de respuesta significativamente menores.
2. FORMATO: Texto plano con HTML mínimo (solo <p>, <br>, <b>). SIN imágenes, SIN colores, SIN headers HTML.
3. ASUNTO: 4-7 palabras, minúsculas o sentence case. NUNCA Title Case ni MAYÚSCULAS.
4. PALABRAS SPAM PROHIBIDAS: gratis, oferta, garantizado, exclusivo, urgente, actúa ahora, descuento, sin coste, oportunidad única, resultados garantizados, dinero, beneficio, promoción, click aquí, sin compromiso.
5. USA ALTERNATIVAS SEGURAS: "complementario" en vez de "gratis", "explorar" en vez de "comprar", "demostrado" en vez de "garantizado", "enfoque personalizado" en vez de "oferta exclusiva".
6. PERSONALIZACIÓN: Usa variables {{variable}} para personalización. MÍNIMO: {{business_name}} y una referencia específica al negocio.
7. UN SOLO CTA: Formulado como pregunta suave, bajo compromiso. Ej: "¿Merece la pena una charla de 15 min?" NO "Agenda una demo ahora".
8. ESTRUCTURA (Framework PAS):
   - HOOK: 1-2 frases reconociendo algo específico del prospecto
   - SEÑAL: 1-2 frases conectando un problema detectable con un reto de negocio
   - PROPUESTA DE VALOR: 2-3 frases, específica y cuantificada si es posible
   - CTA: 1 frase, pregunta suave
9. FIRMA: Solo "{{sender_name}}, de ${ctx.name}". NUNCA "Soy ${ctx.name}". NO añadas footer legal ni link de baja (el sistema los inyecta).
10. VARIACIÓN: El template debe sonar natural y humano, NO como un copy publicitario.
11. PARA FOLLOW-UP: Cambia el ángulo. Si el inicial habla de web, el follow-up habla de SEO o IA. Más breve y directo.
12. PARA BREAKUP: Despedida cordial, deja la puerta abierta, sin culpa ni presión.
13. CUMPLIMIENTO LEGAL: El email debe poder identificarse como comunicación comercial. Remitente claramente identificado.
14. NUNCA uses halagos genéricos como "Me encanta lo que hacéis" o "Me encanta lo que hacen".
15. NUNCA prometas resultados, usa lenguaje como "ayudamos a", "conseguimos que".

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

REGLAS PARA WHATSAPP B2B (2026):
1. MÁXIMO 500 caracteres. WhatsApp es conversacional, no formal.
2. Saludo breve y natural, como si hablaras con alguien en persona.
3. Ve al punto rápido: menciona algo ESPECÍFICO del negocio del prospecto usando variables.
4. Si el negocio no tiene web o es de baja calidad, mencionalo como OPORTUNIDAD, no como crítica.
5. Ofrece algo concreto: diagnóstico sin coste, propuesta personalizada, análisis rápido.
6. Cierra con pregunta abierta para generar respuesta.
7. SIN HTML, SIN formato de email.
8. MÁXIMO 1-2 emojis si el tono lo permite. Preferiblemente 0.
9. Firma: "{{sender_name}}, de ${ctx.name}". NUNCA "Soy ${ctx.name}". Sin links, URLs ni dominios.
10. Debe sonar como un mensaje real de WhatsApp, NO como copy publicitario.
11. PROHIBIDO: lenguaje de spam, promesas exageradas, urgencia artificial, "oferta por tiempo limitado".
12. USA ALTERNATIVAS NATURALES: "te comento" en vez de "te informo", "vi que" en vez de "he observado", "qué te parece" en vez de "le interesaría".
13. Para FOLLOW-UP: Referencia al mensaje anterior. Más breve. Nuevo ángulo de valor.
14. Para BREAKUP: Cordial, sin presión, deja la puerta abierta.
15. ANTI-BLOQUEO: Los mensajes repetitivos o demasiado comerciales provocan reportes y bloqueo del número. Naturalidad ante todo.
16. PERSONALIZACIÓN: Usa variables {{variable}} para hacer el mensaje específico al prospecto.
17. NO incluyas URLs, links ni dominios en el mensaje. Favorecen detección de spam y bloqueo del número.

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

REGLAS: Máximo 500 caracteres, conversacional, sin HTML, sin emojis excesivos, que suene como WhatsApp real. Puede hablar de web, SEO, IA, Google Business o redes según lo que sea más relevante. NO incluyas URLs, links ni dominios en el mensaje.

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
