import type { WebAnalysis } from "./gemini";

interface LeadData {
  website: string | null;
  webQualityScore: number | null;
  reviewCount: number | null;
  rating: number | null;
  category: string | null;
  email: string | null;
  extractedEmail: string | null;
}

/**
 * Calculate an Opportunity Score (0-100) that prioritizes leads
 * most likely to need and buy digital services (web, SEO, AI, etc.).
 *
 * Higher score = better opportunity.
 */
export function calculateOpportunityScore(lead: LeadData, analysis?: WebAnalysis | null): number {
  let score = 0;

  // 1. Web quality is a major factor (0-35 points)
  if (!lead.website || lead.website.trim() === "") {
    score += 35; // No website at all = high opportunity
  } else if (lead.webQualityScore !== null) {
    score += Math.round(35 * (1 - lead.webQualityScore / 100));
  } else {
    score += 18; // Unknown quality, assume medium
  }

  // 2. SEO score (0-20 points) — poor SEO = great opportunity
  if (analysis && typeof analysis.seoScore === "number") {
    score += Math.round(20 * (1 - analysis.seoScore / 100));
  } else if (lead.website) {
    score += 10; // Has website but no SEO data = assume medium
  }

  // 3. AI / automation opportunities (0-10 points)
  if (analysis?.aiAgentOpportunities && analysis.aiAgentOpportunities.length > 0) {
    score += Math.min(10, analysis.aiAgentOpportunities.length * 3);
  }

  // 4. Google Business opportunities (0-5 points)
  if (analysis?.googleBusinessOpportunities && analysis.googleBusinessOpportunities.length > 0) {
    score += Math.min(5, analysis.googleBusinessOpportunities.length * 2);
  }

  // 5. Business has reviews = established business (0-10 points)
  if (lead.reviewCount !== null && lead.reviewCount > 0) {
    if (lead.reviewCount >= 50) score += 10;
    else if (lead.reviewCount >= 20) score += 8;
    else if (lead.reviewCount >= 5) score += 5;
    else score += 3;
  }

  // 6. Good rating = successful business likely to invest (0-5 points)
  if (lead.rating !== null && lead.rating > 0) {
    if (lead.rating >= 4.5) score += 5;
    else if (lead.rating >= 4.0) score += 3;
    else if (lead.rating >= 3.5) score += 2;
  }

  // 7. Has contact email = can actually reach them (0-10 points)
  if (lead.email || lead.extractedEmail) {
    score += 10;
  }

  // 8. Multiple services recommended = bigger deal (0-5 points)
  if (analysis?.recommendedServices && analysis.recommendedServices.length > 1) {
    score += Math.min(5, analysis.recommendedServices.length * 2);
  }

  return Math.min(100, Math.max(0, score));
}
