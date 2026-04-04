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

/** Default WebAnalysis for leads without analysis data */
export function defaultWebAnalysis(website: string | null, qualityScore: number, summary: string): WebAnalysis {
  return {
    hasWebsite: !!website,
    qualityScore: qualityScore || 0,
    issues: [],
    strengths: [],
    summary: summary || "",
    isMobile: false,
    hasSSL: false,
    loadSpeed: "unknown" as const,
    designScore: 0,
    contentScore: 0,
    functionalityScore: 0,
    extractedEmails: [],
    seoScore: 50,
    seoIssues: [],
    googleBusinessOpportunities: [],
    socialMediaPresence: [],
    aiAgentOpportunities: [],
    recommendedServices: ["web_development"],
  };
}
