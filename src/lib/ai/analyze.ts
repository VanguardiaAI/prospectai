import { getGenAI, safeParseJSON, cleanJsonResponse, getAgencyContext, getLocaleLabel } from "./config";
import { withRetry } from "@/lib/ai/retry";
import { geminiRateLimiter } from "@/lib/ai/rate-limiter";
import { GEMINI_MAX_RETRIES, GEMINI_BASE_DELAY_MS } from "@/lib/constants";
import type { WebAnalysis } from "./types";

export async function analyzeWebsite(
  businessName: string,
  businessCategory: string | null,
  websiteUrl: string,
  scrapedContent: string,
  scrapedMeta: Record<string, string>
): Promise<WebAnalysis> {
  const model = getGenAI().getGenerativeModel({ model: "gemini-2.5-flash" });
  const ctx = getAgencyContext();
  const localeLabel = getLocaleLabel(ctx.country);
  const servicesDesc = ctx.services.map((s) => `- ${s.label}: ${s.description}`).join("\n");

  const prompt = `You are an expert in digital marketing and web development evaluating a business's online presence.

BUSINESS: ${businessName}
CATEGORY: ${businessCategory || "Not specified"}
URL: ${websiteUrl}
TARGET COUNTRY: ${ctx.country}

SITE CONTENT (first 3000 characters):
${scrapedContent.substring(0, 3000)}

META INFORMATION:
${JSON.stringify(scrapedMeta, null, 2)}

SERVICES WE OFFER AS AGENCY:
${servicesDesc}

Evaluate the website AND the overall digital presence of the business. Respond in ${localeLabel}. Respond ONLY with valid JSON (no markdown, no backticks):
{
  "hasWebsite": true,
  "qualityScore": <0-100 where 0=terrible and 100=excellent>,
  "issues": ["list of issues found on the website"],
  "strengths": ["list of strengths if any"],
  "summary": "brief summary of site quality and digital presence",
  "isMobile": <true/false whether it appears responsive>,
  "hasSSL": <true/false>,
  "loadSpeed": "<fast|medium|slow|unknown>",
  "designScore": <0-100>,
  "contentScore": <0-100>,
  "functionalityScore": <0-100>,
  "extractedEmails": ["emails found in the content"],
  "seoScore": <0-100 evaluating title, meta description, headings, content, friendly URLs>,
  "seoIssues": ["specific SEO issues: missing meta description, no H1, thin content, etc."],
  "googleBusinessOpportunities": ["Google Business improvement opportunities: no listing, incomplete listing, few reviews, no photos, etc."],
  "socialMediaPresence": ["detected social media presence: links found, missing social profiles, etc."],
  "aiAgentOpportunities": ["AI opportunities: needs chatbot, FAQs that could be automated, booking system, 24/7 support, etc."],
  "recommendedServices": ["list of recommended service keys from: ${ctx.services.map((s) => s.key).join(", ")}"]
}`;

  const result = await withRetry(async () => {
    await geminiRateLimiter.acquire();
    return model.generateContent(prompt);
  }, { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS, label: "analyze-website" });
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
