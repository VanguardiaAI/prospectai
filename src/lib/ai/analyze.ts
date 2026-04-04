import { genAI, safeParseJSON, cleanJsonResponse, getAgencyContext, getLocaleLabel } from "./config";
import type { WebAnalysis } from "./types";

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
  const jsonStr = cleanJsonResponse(text);
  const parsed = safeParseJSON<WebAnalysis>(jsonStr, "analysis");

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
