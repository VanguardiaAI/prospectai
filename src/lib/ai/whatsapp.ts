import { genAI, safeParseJSON, cleanJsonResponse, getAgencyContext, getLocaleLabel, getLocaleWritingRules, SERVICE_DEFINITIONS } from "./config";
import { withRetry } from "@/lib/ai/retry";
import { geminiRateLimiter } from "@/lib/ai/rate-limiter";
import { GEMINI_MAX_RETRIES, GEMINI_BASE_DELAY_MS } from "@/lib/constants";
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
    ? `\nDIGITAL PRESENCE ANALYSIS:
- Web score: ${analysis.qualityScore}/100
- SEO score: ${analysis.seoScore ?? "N/A"}/100
- Issues: ${analysis.issues.join(", ")}
- SEO opportunities: ${(analysis.seoIssues || []).join(", ")}
- AI opportunities: ${(analysis.aiAgentOpportunities || []).join(", ")}
- Recommended services: ${(analysis.recommendedServices || []).map((k) => SERVICE_DEFINITIONS[k]?.label || k).join(", ")}
- Summary: ${analysis.summary}`
    : "\nTheir website has not been analyzed or they don't have a website.";

  const stepContext = sequenceStep && sequenceStep > 1
    ? `\nThis is FOLLOW-UP #${sequenceStep - 1}. You already contacted them before. Be shorter and more direct. Change the angle. You can reference that you already wrote to them.`
    : "";

  const extraInstructions = customInstructions ? `\nADDITIONAL INSTRUCTIONS: ${customInstructions}` : "";

  const prompt = `You are a B2B sales expert writing a WhatsApp prospecting message for ${ctx.name} (${ctx.url}).
${ctx.description}

BUSINESS DATA:
- Name: ${businessName}
- Category: ${businessCategory || "Not specified"}
- City: ${city || "Not specified"}
- Current website: ${websiteUrl || "None"}
${analysisContext}

TONE: ${tone}
SENDER: ${fromName} from ${ctx.name}
${stepContext}
${extraInstructions}

MAIN GOAL OF THE MESSAGE:
The prospect must feel they GAIN something by talking to you. You are NOT auditing them or pointing out flaws: you are showing them how they can get MORE CUSTOMERS or MORE SALES. Every technical problem you mention must be connected to a tangible business benefit.

MESSAGE STRUCTURE:
1. OPENING (1 line): Natural greeting + who you are. Brief.
2. VALUE HOOK (1-2 lines): Something specific about their business connected to a GROWTH OPPORTUNITY. Do NOT list technical problems. Translate each issue into what it means in customers or sales.
3. PROPOSAL (1 line): What you concretely offer and what they will achieve with it.
4. CLOSING (1 line): Natural open-ended question that invites a reply.

GOOD MESSAGE vs BAD MESSAGE EXAMPLES:

BAD (sounds like spam, lists problems, doesn't say what they gain):
"Hola. Soy Álex, de ${ctx.name}, y hemos visto vuestra web en La Chata de Guadalajara. Hemos notado que tiene contenido de casinos ajeno a vuestro negocio, algo crítico por seguridad y para vuestra imagen online. Además, carece de certificados SSL y no está adaptada a móviles. Podemos ofrecerte un diagnóstico gratuito para ver cómo optimizarla y asegurar vuestra presencia digital. ¿Te gustaría que lo analizáramos sin compromiso?"

Why it's bad: uses "vuestra" (Spain dialect) for a Mexican business, lists technical problems the owner doesn't understand, doesn't say what they gain, "free diagnosis" sounds like spam, uses opening question mark in WhatsApp.

GOOD (conversational, benefit-focused, region-adapted):
"Hola, soy Álex de ${ctx.name}. Vi La Chata de Guadalajara y la verdad es que se ve que tienen muy buena propuesta gastronómica. Me di cuenta de que su web podría estar alejando clientes en lugar de atraerlos, sobre todo desde el celular que es donde busca la gente hoy. Ayudamos a restaurantes como el suyo a que les lleguen más comensales por internet. Te puedo armar un análisis rápido para que veas el potencial, te interesa?"

Why it's good: uses "su" not "vuestra", says "celular" not "móvil" (Mexican Spanish), connects the problem with LOSING CUSTOMERS, offers to show "the potential" (positive framing), closes naturally without opening question mark.

ANOTHER GOOD EXAMPLE (business without a website):
"Hola, soy Álex de ${ctx.name}. Busqué La Chata de Guadalajara en internet y no encontré una web del negocio. Eso significa que todos los clientes que buscan taquerías en Google no los están encontrando a ustedes, se están yendo a la competencia. Ayudamos a negocios gastronómicos a captar esos clientes con una presencia web que de verdad genere visitas. Quieres que te cuente cómo funciona?"

MESSAGE RULES:
1. Write in ${localeLabel}
2. Maximum 500 characters. WhatsApp is conversational, not formal
3. ALWAYS translate technical problems into BUSINESS IMPACT: "no SSL" -> "customers see an unsafe site warning and leave", "not responsive" -> "people searching from their phone can't see your page properly and go to the competition"
4. NEVER use technical jargon without explaining what it means for their bottom line: no bare "SSL", "responsive", "SEO", "meta tags". If you mention something technical, explain the impact on customers/sales
5. The benefit is always: more customers, more visits, more sales, better image, not losing customers to the competition
6. If they have no website or a low-quality one, frame it as a GROWTH opportunity, never as criticism
7. Offer something concrete focused on the result: "see how many customers you could be capturing", "analysis of your area's potential", NOT "free diagnosis" or "audit" which sound like a salesperson
8. Do NOT use HTML, do NOT use email formatting
9. Do NOT use excessive emojis (maximum 1-2 if the tone allows it)
10. Sign only with the name, no links or additional data
11. It must sound like a real WhatsApp message you would send to a professional acquaintance, not advertising copy
12. Introduce yourself as "${fromName}, from ${ctx.name}". NEVER say "I am ${ctx.name}" or introduce yourself as the company
13. Do NOT include URLs, links, or domains in the message. They trigger spam detection and number blocking
14. NEVER use the opening question mark character. Nobody uses it in WhatsApp
15. NEVER say "no strings attached", "free", "free diagnosis". It sounds like telemarketing. Use natural alternatives: "I can put together an analysis for you", "let me tell you how it works", "I'll show you the potential"

REGIONAL ADAPTATION (CRITICAL):
The business is in ${city || "unspecified location"}. You MUST adapt your language to the country of THAT city, NOT the agency's country. If the city is in Mexico, write in Mexican Spanish. If in Argentina, in Argentine Spanish. If in Spain, in European Spanish. This is MANDATORY.
${writingRules}

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "message": "the whatsapp message"
}`;

  const result = await withRetry(async () => {
    await geminiRateLimiter.acquire();
    return model.generateContent(prompt);
  }, { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS, label: "generate-whatsapp" });
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

  const prompt = `You are a B2B sales expert. You need to REGENERATE a WhatsApp prospecting message for ${ctx.name} (${ctx.url}).

BUSINESS DATA:
- Name: ${businessName}
- Category: ${businessCategory || "Not specified"}
- City: ${city || "Not specified"}
- Website: ${websiteUrl || "None"}

PREVIOUS MESSAGE:
${previousMessage}

NEW TONE: ${tone}
INSTRUCTIONS: ${instructions || "Just change the tone"}
SENDER: ${fromName}, from ${ctx.name}. Introduce yourself as "${fromName}, from ${ctx.name}". NEVER say "I am ${ctx.name}".
LANGUAGE: ${localeLabel}

RULES: Maximum 500 characters, conversational, no HTML, no excessive emojis, must sound like a real WhatsApp message. Focus on what the prospect GAINS (more customers, more sales), not on listing technical problems. Translate each problem into business impact. NEVER use "free", "no strings attached", "free diagnosis". NEVER use technical jargon without explaining what the business loses. NEVER use the opening question mark character (nobody uses it in WhatsApp). You may talk about web, SEO, AI, Google Business, or social media depending on what is most relevant. Do NOT include URLs, links, or domains in the message.

REGIONAL ADAPTATION (CRITICAL):
The business is in ${city || "unspecified location"}. You MUST adapt your language to the country of THAT city, NOT the agency's country. If the city is in Mexico, write in Mexican Spanish. If in Argentina, in Argentine Spanish. If in Spain, in European Spanish. This is MANDATORY.
${writingRules}

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "message": "the new whatsapp message"
}`;

  const result = await withRetry(async () => {
    await geminiRateLimiter.acquire();
    return model.generateContent(prompt);
  }, { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS, label: "regenerate-whatsapp" });
  const text = result.response.text().trim();
  const jsonStr = cleanJsonResponse(text);
  return safeParseJSON<WhatsAppGeneration>(jsonStr, "wa-regen");
}
