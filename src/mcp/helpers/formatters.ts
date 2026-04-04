interface LeadRow {
  id: number;
  name: string;
  city?: string | null;
  category?: string | null;
  opportunityScore?: number | null;
  webQualityScore?: number | null;
  status: string;
  email?: string | null;
  extractedEmail?: string | null;
  contactEmail?: string | null;
  phone?: string | null;
  website?: string | null;
  analysisJson?: string | null;
  analysisSummary?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  address?: string | null;
  state?: string | null;
  notes?: string | null;
  importedAt?: string | null;
  analyzedAt?: string | null;
  errorMessage?: string | null;
}

export function formatLeadSummary(lead: LeadRow): string {
  const parts = [`[ID:${lead.id}] ${lead.name}`];
  if (lead.city) parts.push(`(${lead.city})`);
  if (lead.category) parts.push(`- ${lead.category}`);
  parts.push(`| Score: ${lead.opportunityScore ?? "N/A"}`);
  parts.push(`| Status: ${lead.status}`);
  const hasEmail = !!(lead.contactEmail || lead.extractedEmail || lead.email);
  const hasPhone = !!lead.phone;
  const contacts = [hasEmail && "email", hasPhone && "phone"].filter(Boolean).join(", ");
  if (contacts) parts.push(`| ${contacts}`);
  return parts.join(" ");
}

export function formatLeadDetails(lead: LeadRow): string {
  const lines: string[] = [
    `# ${lead.name}`,
    `ID: ${lead.id} | Status: ${lead.status}`,
  ];
  if (lead.category) lines.push(`Category: ${lead.category}`);
  if (lead.city || lead.state) lines.push(`Location: ${[lead.city, lead.state].filter(Boolean).join(", ")}`);
  if (lead.address) lines.push(`Address: ${lead.address}`);
  if (lead.website) lines.push(`Website: ${lead.website}`);
  if (lead.phone) lines.push(`Phone: ${lead.phone}`);
  const email = lead.contactEmail || lead.extractedEmail || lead.email;
  if (email) lines.push(`Email: ${email}`);
  if (lead.rating) lines.push(`Rating: ${lead.rating}/5 (${lead.reviewCount ?? 0} reviews)`);
  lines.push(`Opportunity Score: ${lead.opportunityScore ?? "N/A"}/100`);
  lines.push(`Web Quality: ${lead.webQualityScore ?? "N/A"}/100`);

  if (lead.analysisJson) {
    try {
      const analysis = JSON.parse(lead.analysisJson);
      if (analysis.summary) lines.push(`\nSummary: ${analysis.summary}`);
      if (analysis.recommendedServices?.length) {
        lines.push(`Recommended Services: ${analysis.recommendedServices.join(", ")}`);
      }
      if (analysis.issues?.length) {
        lines.push(`Issues: ${analysis.issues.slice(0, 5).join("; ")}`);
      }
      if (analysis.strengths?.length) {
        lines.push(`Strengths: ${analysis.strengths.slice(0, 3).join("; ")}`);
      }
      if (analysis.seoScore != null) lines.push(`SEO Score: ${analysis.seoScore}/100`);
    } catch { /* skip parse errors */ }
  } else if (lead.analysisSummary) {
    lines.push(`\nSummary: ${lead.analysisSummary}`);
  }

  if (lead.errorMessage) lines.push(`\nError: ${lead.errorMessage}`);
  if (lead.notes) lines.push(`Notes: ${lead.notes}`);
  return lines.join("\n");
}

interface EmailRow {
  id: number;
  subject: string;
  bodyText: string;
  bodyHtml: string;
  toEmail: string;
  fromEmail?: string | null;
  tone: string;
  status: string;
  createdAt: string;
}

export function formatEmailSummary(email: EmailRow, leadName: string): string {
  return `[ID:${email.id}] To: ${leadName} <${email.toEmail}> | "${email.subject}" | ${email.status} | ${email.tone}`;
}

export function formatEmailPreview(email: EmailRow, leadName: string): string {
  return [
    `# Email Preview [ID:${email.id}]`,
    `To: ${leadName} <${email.toEmail}>`,
    `Subject: ${email.subject}`,
    `Tone: ${email.tone} | Status: ${email.status}`,
    `---`,
    email.bodyText,
  ].join("\n");
}

interface WARow {
  id: number;
  body: string;
  toPhone: string;
  tone: string;
  status: string;
  createdAt: string;
}

export function formatWASummary(msg: WARow, leadName: string): string {
  const preview = msg.body.length > 80 ? msg.body.slice(0, 80) + "..." : msg.body;
  return `[ID:${msg.id}] To: ${leadName} (${msg.toPhone}) | "${preview}" | ${msg.status}`;
}

export function formatWAPreview(msg: WARow, leadName: string): string {
  return [
    `# WhatsApp Preview [ID:${msg.id}]`,
    `To: ${leadName} (${msg.toPhone})`,
    `Tone: ${msg.tone} | Status: ${msg.status}`,
    `---`,
    msg.body,
  ].join("\n");
}

interface CampaignRow {
  id: number;
  name: string;
  status: string;
  dailyLimit: number;
  qualityThreshold: number;
  autopilot: boolean;
  defaultTone: string;
  description?: string | null;
}

interface CampaignMetrics {
  totalLeads: number;
  emailsSent: number;
  emailsOpened: number;
  emailsClicked: number;
  replies: number;
  pendingDrafts: number;
}

export function formatCampaignSummary(campaign: CampaignRow, metrics: CampaignMetrics): string {
  const parts = [
    `[ID:${campaign.id}] ${campaign.name}`,
    `| ${campaign.status}`,
    `| ${metrics.totalLeads} leads`,
    `| ${metrics.emailsSent} sent`,
    `| ${metrics.pendingDrafts} drafts`,
  ];
  if (metrics.emailsSent > 0) {
    const openRate = Math.round((metrics.emailsOpened / metrics.emailsSent) * 100);
    parts.push(`| ${openRate}% open`);
  }
  if (metrics.replies > 0) parts.push(`| ${metrics.replies} replies`);
  if (campaign.autopilot) parts.push(`| AUTOPILOT`);
  return parts.join(" ");
}

interface ActivityRow {
  id: number;
  type: string;
  message: string;
  createdAt: string;
}

export function formatActivityEntry(entry: ActivityRow): string {
  return `[${entry.createdAt}] ${entry.type}: ${entry.message}`;
}
