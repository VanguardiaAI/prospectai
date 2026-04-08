import { genAI, safeParseJSON, cleanJsonResponse, getAgencyContext, getLocaleLabel, getLocaleWritingRules } from "./config";
import { withRetry } from "@/lib/ai/retry";
import { geminiRateLimiter } from "@/lib/ai/rate-limiter";
import { GEMINI_MAX_RETRIES, GEMINI_BASE_DELAY_MS } from "@/lib/constants";
import type { TemplateGeneration, WhatsAppTemplateGeneration } from "./types";

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
    initial: "First contact, initial cold prospecting email",
    follow_up: "Follow-up, second or third contact, different angle, shorter",
    breakup: "Breakup, last message in the sequence, cordial farewell",
  };

  const wordLimits = {
    initial: "75-125 words",
    follow_up: "50-75 words",
    breakup: "40-60 words",
  };

  const prompt = `You are an expert in B2B cold email and copywriting for ${ctx.name} (${ctx.url}).
${ctx.description}

GENERATE A REUSABLE EMAIL TEMPLATE for the industry: "${industry}"
PURPOSE: ${purposeMap[purpose]}
TONE: ${tone}
LANGUAGE: Write in ${localeLabel}
${customInstructions ? `ADDITIONAL INSTRUCTIONS: ${customInstructions}` : ""}

SERVICES WE OFFER:
${servicesDesc}

CORE PRINCIPLE - BENEFIT-FOCUSED APPROACH:
The business owner does NOT care about technical problems. They care about getting MORE CUSTOMERS and MORE SALES. Every problem must be translated into business impact:
- "No SSL" → "Visitors see 'not secure' and leave for the competition"
- "Not responsive" → "70% search from their phone and can't navigate the site properly"
- "Low SEO" → "When people search for {{category}} in {{city}}, the competition shows up and they don't"
- "No website" → "Customers searching on Google can't find them"

CRITICAL ANTI-SPAM RULES AND BEST PRACTICES (2026):
1. LENGTH: ${wordLimits[purpose]}. Emails over 150 words have significantly lower response rates.
2. FORMAT: Plain text with minimal HTML (only <p>, <br>, <b>). NO images, NO colors, NO HTML headers.
3. SUBJECT LINE: 4-7 words, sentence case, sparking curiosity about the BENEFIT, not the problem. E.g.: "more customers for {{business_name}}" NOT "problems with your website".
4. BANNED SPAM WORDS: free, offer, guaranteed, exclusive, urgent, act now, discount, no cost, once-in-a-lifetime, guaranteed results, money, profit, promotion, click here, no obligation, free audit.
5. USE NATURAL ALTERNATIVES: "I'll put together an analysis" instead of "free audit", "I'll show you the potential" instead of "exclusive offer", "I'll walk you through how it works" instead of "no obligation".
6. PERSONALIZATION: Use {{variable}} placeholders. MINIMUM: {{business_name}} and a specific reference to the business.
7. SINGLE CTA: Soft question oriented toward the benefit. E.g.: "Would you be interested in seeing how much potential your area has?" NOT "Book a demo now".
8. STRUCTURE (Benefit-oriented PAS Framework):
   - HOOK: 1-2 sentences showing you researched the business. NO generic compliments.
   - OPPORTUNITY: 2-3 sentences connecting what you found to customers/sales they could capture. NEVER list technical problems on their own.
   - CREDIBILITY: 1 sentence about how you help similar businesses (without promising exact figures).
   - CTA: 1 sentence, soft question about the benefit.
9. SIGNATURE: Only "{{sender_name}}, from ${ctx.name}". NEVER "I am ${ctx.name}". Do NOT add a legal footer or unsubscribe link (the system injects those).
10. VARIATION: The template must sound natural and human, NOT like advertising copy.
11. FOR FOLLOW-UP: Change the angle. If the initial email talks about the website, the follow-up talks about SEO or AI. Shorter and more direct.
12. FOR BREAKUP: Cordial farewell, leave the door open, no guilt or pressure.
13. LEGAL COMPLIANCE: The email must be identifiable as a commercial communication. Sender clearly identified.
14. NEVER use generic compliments like "I love what you do" or "I love what you're doing".
15. NEVER promise exact results, use language like "we help", "we've helped businesses".
16. NEVER use technical jargon without translating it to impact: no "SSL", "responsive", "SEO" on their own. Always explain what it means for their customers/sales.

REGIONAL ADAPTATION (CRITICAL):
The template will use the {{city}} variable for personalization. Adapt the language to the locale: ${localeLabel}. Write naturally for that market.
${writingRules}

AVAILABLE VARIABLES to use in the template:
- {{business_name}}: business name
- {{category}}: business category/industry
- {{city}}: business city
- {{website}}: business website
- {{issue}}: specific issue detected in their digital presence
- {{sender_name}}: sender name
- {{service}}: recommended service

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "name": "short descriptive template name",
  "subject": "email subject with {{variables}} if applicable",
  "bodyHtml": "minimal HTML email content (<p>, <b>, <br>)",
  "bodyText": "plain text version of the email",
  "variables": ["list", "of", "variables", "used"]
}`;

  const result = await withRetry(async () => {
    await geminiRateLimiter.acquire();
    return model.generateContent(prompt);
  }, { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS, label: "generate-email-template" });
  const text = result.response.text().trim();
  const jsonStr = cleanJsonResponse(text);
  return safeParseJSON<TemplateGeneration>(jsonStr, "template");
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
    initial: "First contact, initial prospecting message",
    follow_up: "Follow-up, second contact, different angle, shorter",
    breakup: "Breakup, last message, cordial farewell",
  };

  const prompt = `You are an expert in B2B WhatsApp sales for ${ctx.name} (${ctx.url}).
${ctx.description}

GENERATE A REUSABLE WHATSAPP TEMPLATE for the industry: "${industry}"
PURPOSE: ${purposeMap[purpose]}
TONE: ${tone}
LANGUAGE: Write in ${localeLabel}
${customInstructions ? `ADDITIONAL INSTRUCTIONS: ${customInstructions}` : ""}

SERVICES WE OFFER:
${servicesDesc}

CORE PRINCIPLE - BENEFIT-FOCUSED APPROACH:
The prospect needs to feel they are GAINING something. Don't audit them or point out errors: show them how they can get MORE CUSTOMERS or MORE SALES. Translate every technical problem into business impact:
- "No website" → "customers searching on Google can't find you, they go to the competition"
- "Slow/bad website" → "people visit, it doesn't load properly, and they leave"
- "No social media presence" → "your competitors are capturing your potential customers there"

RULES FOR WHATSAPP B2B (2026):
1. MAXIMUM 500 characters. WhatsApp is conversational, not formal.
2. Brief and natural greeting, as if you were talking to someone in person.
3. ALWAYS translate problems into BUSINESS IMPACT: customers they're losing, sales they're missing, competition that's beating them.
4. NEVER use technical jargon without explaining what the business is losing: no "SSL", "responsive", "SEO" on their own.
5. If the business has no website or a low-quality one, mention it as a GROWTH OPPORTUNITY, not as criticism.
6. Offer something focused on results: "see how many customers you could capture", "analysis of your area's potential". NEVER "free audit", "no obligation", "free".
7. Close with a natural open question to generate a reply. Use only a closing question mark (?).
8. NO HTML, NO email formatting.
9. MAXIMUM 1-2 emojis if the tone allows it. Preferably 0.
10. Signature: "{{sender_name}}, from ${ctx.name}". NEVER "I am ${ctx.name}". No links, URLs, or domains.
11. Must sound like a real WhatsApp message to a professional acquaintance, NOT like advertising copy.
12. FORBIDDEN: spam language, exaggerated promises, artificial urgency, "limited time offer", "no obligation".
13. USE NATURAL ALTERNATIVES: "I noticed" instead of "I have observed", "what do you think" instead of "would you be interested", "just reaching out" instead of "I am writing to inform you".
14. For FOLLOW-UP: Reference the previous message. Shorter. New value angle.
15. For BREAKUP: Cordial, no pressure, leave the door open.
16. ANTI-BLOCK: Repetitive or overly commercial messages cause reports and number blocking. Naturalness above all.
17. PERSONALIZATION: Use {{variable}} placeholders to make the message specific to the prospect.
18. Do NOT include URLs, links, or domains in the message. They trigger spam detection and number blocking.

REGIONAL ADAPTATION (CRITICAL):
The template will use the {{city}} variable for personalization. Adapt the language to the locale: ${localeLabel}. Write naturally for that market.
${writingRules}

AVAILABLE VARIABLES:
- {{business_name}}: business name
- {{category}}: category/industry
- {{city}}: city
- {{issue}}: detected issue
- {{sender_name}}: sender name
- {{service}}: recommended service

Respond ONLY with valid JSON (no markdown, no backticks):
{
  "name": "short descriptive template name",
  "message": "the WhatsApp message with {{variables}}",
  "variables": ["list", "of", "variables", "used"]
}`;

  const result = await withRetry(async () => {
    await geminiRateLimiter.acquire();
    return model.generateContent(prompt);
  }, { maxRetries: GEMINI_MAX_RETRIES, baseDelayMs: GEMINI_BASE_DELAY_MS, label: "generate-whatsapp-template" });
  const text = result.response.text().trim();
  const jsonStr = cleanJsonResponse(text);
  return safeParseJSON<WhatsAppTemplateGeneration>(jsonStr, "wa-template");
}
