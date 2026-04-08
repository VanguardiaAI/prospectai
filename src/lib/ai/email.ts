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
  if (analysis.issues.length > 0) issueContext.push(`Web issues: ${analysis.issues.join(", ")}`);
  if (analysis.seoIssues?.length > 0) issueContext.push(`SEO issues: ${analysis.seoIssues.join(", ")}`);
  if (analysis.googleBusinessOpportunities?.length > 0) issueContext.push(`Google Business opportunities: ${analysis.googleBusinessOpportunities.join(", ")}`);
  if (analysis.aiAgentOpportunities?.length > 0) issueContext.push(`AI opportunities: ${analysis.aiAgentOpportunities.join(", ")}`);

  const stepContext = sequenceStep && sequenceStep > 1
    ? `\nThis is FOLLOW-UP #${sequenceStep - 1}. The business already received ${sequenceStep - 1} previous message(s). DO NOT repeat what you probably already said. Change the angle: if you previously talked about web, now talk about SEO or AI. Be shorter and more direct. You can reference that you already reached out before.`
    : "";

  const extraInstructions = customInstructions ? `\nADDITIONAL INSTRUCTIONS: ${customInstructions}` : "";

  const prompt = `You are an expert copywriter generating prospecting emails for ${ctx.name} (${ctx.url}).
${ctx.description}

Your goal: write an email that makes the business owner WANT to respond because they see a clear opportunity to get more customers or more sales.

BUSINESS DATA:
- Name: ${businessName}
- Category: ${businessCategory || "Not specified"}
- City: ${city || "Not specified"}
- Current website: ${websiteUrl || "None"}

DIGITAL PRESENCE ANALYSIS:
- Web score: ${analysis.qualityScore}/100
- SEO score: ${analysis.seoScore ?? "N/A"}/100
${issueContext.map((i) => `- ${i}`).join("\n")}
- Summary: ${analysis.summary}

RECOMMENDED SERVICES FOR THIS BUSINESS:
${recommendedServices}

EMAIL TONE: ${tone}
${stepContext}
${extraInstructions}

FUNDAMENTAL PRINCIPLE - BENEFIT-FOCUSED:
The prospect does NOT care about their technical problems. They care about getting MORE CUSTOMERS and MORE SALES. Every problem you mention must be translated into business impact:
- "No SSL" -> "Visitors see a 'not secure' warning and leave for the competition"
- "Not responsive" -> "70% of people search from their phone and can't navigate the site properly"
- "Low SEO" -> "When someone searches for [their category] in [their city], the competition shows up and they don't"
- "No website" -> "All the customers searching on Google for a business like theirs can't find them"
- "Hacked/spam content" -> "Google may be penalizing the site and customers see content that damages the business image"

EMAIL STRUCTURE (Benefit-oriented PAS Framework):
1. HOOK (1-2 sentences): Something specific about the business that shows you researched them. Do NOT give generic compliments.
2. OPPORTUNITY (2-3 sentences): Connect what you found with a concrete growth opportunity. Do NOT list technical problems. Talk about customers they are losing or could capture.
3. PROOF/CREDIBILITY (1 sentence): Briefly mention how you help similar businesses (without promising exact results).
4. CTA (1 sentence): Soft question aimed at making the prospect want to learn more. E.g.: "Would you be interested in seeing how much potential your area has?" NOT: "Schedule a call".

INSTRUCTIONS:
1. Write in ${localeLabel}
2. The email must be brief (75-125 words max for initial, 50-75 for follow-up), direct, and personalized
3. NEVER use technical jargon without translating it to business impact. No bare "SSL", "responsive", "SEO", "meta tags"
4. Offer the most relevant solution (1-2 services max), but framed as a RESULT for the business
5. Introduce yourself as "${fromName}, from ${ctx.name}". NEVER say "I am ${ctx.name}" or introduce yourself as if you were the company
6. Do NOT use spam language: no "free", "no commitment", "special offer", "free audit". Use natural alternatives: "I'll put together an analysis", "I'll show you the potential", "I'll walk you through how it works"
7. The email must feel like it was written by a real person to another real person
8. NEVER use generic compliments like "I love what you do" or "Great project"
9. The subject line must be short (4-7 words), in sentence case, and spark curiosity about the BENEFIT, not the problem
10. Do NOT add any legal footer or unsubscribe text, the system injects them automatically

REGIONAL ADAPTATION (CRITICAL):
The business is in ${city || "unspecified location"}. You MUST adapt your language to the country of THAT city, NOT the agency's country. If the city is in Mexico, write in Mexican Spanish. If in Argentina, in Argentine Spanish. If in Spain, in European Spanish. This is MANDATORY.
${writingRules}

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "subject": "email subject",
  "bodyHtml": "HTML email content with basic formatting (<p>, <b>, <br>, <a>)",
  "bodyText": "plain text version of the email"
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

  const prompt = `You are an expert copywriter. You need to REGENERATE a prospecting email for ${ctx.name} (${ctx.url}).

BUSINESS DATA:
- Name: ${businessName}
- Category: ${businessCategory || "Not specified"}
- City: ${city || "Not specified"}
- Website: ${websiteUrl || "None"}
- Web quality: ${analysis.qualityScore}/100
- SEO: ${analysis.seoScore ?? "N/A"}/100
- Issues: ${analysis.issues.join(", ")}
- SEO opportunities: ${(analysis.seoIssues || []).join(", ")}
- AI opportunities: ${(analysis.aiAgentOpportunities || []).join(", ")}

PREVIOUS EMAIL:
Subject: ${previousSubject}
Body: ${previousBody}

NEW TONE: ${tone}
ADDITIONAL INSTRUCTIONS: ${instructions || "Just change the tone"}
SENDER: ${fromName}, from ${ctx.name}. ALWAYS introduce yourself as "${fromName}, from ${ctx.name}". NEVER say "I am ${ctx.name}".
LANGUAGE: ${localeLabel}
Do NOT add any legal footer or unsubscribe text, the system injects them automatically.

KEY PRINCIPLE: The email must focus on what the prospect GAINS (more customers, more sales, more visibility), NOT on listing technical problems. Translate every problem into business impact. NEVER use technical jargon without explaining what it means for their customers/sales. Avoid "free", "no commitment", "free audit" - use natural alternatives.

REGIONAL ADAPTATION (CRITICAL):
The business is in ${city || "unspecified location"}. You MUST adapt your language to the country of THAT city, NOT the agency's country. If the city is in Mexico, write in Mexican Spanish. If in Argentina, in Argentine Spanish. If in Spain, in European Spanish. This is MANDATORY.
${writingRules}

Generate a different version of the email. Respond ONLY with valid JSON (no markdown, no backticks):
{
  "subject": "new subject",
  "bodyHtml": "new HTML content",
  "bodyText": "new plain text version"
}`;

  const result = await model.generateContent(prompt);
  const text = result.response.text().trim();
  const jsonStr = cleanJsonResponse(text);
  return safeParseJSON<EmailGeneration>(jsonStr, "email-regen");
}
