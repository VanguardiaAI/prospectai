/** Auth state of the persistent Workana session. Mirrors `workana_auth_state`. */
export type WorkanaAuthState = "disconnected" | "connected" | "needs_reauth";

/** Filters for a saved search → built into a /jobs feed URL. */
export interface WorkanaSearchFilters {
  categories?: string[];
  skills?: string[];
  keywords?: string;
  language?: string;
}

/** A project as scraped from the feed (raw, pre-AI-evaluation). */
export interface ScrapedProject {
  /** Workana slug/id — unique, dedup key. */
  workanaProjectId: string;
  url: string;
  title: string;
  description: string;
  skills: string[];
  budgetText: string | null;
  bidsCount: number | null;
  publishedText: string | null;
  /** Full readable text of the card/detail — fed to the AI evaluator. */
  rawText: string;
}

/** Freelancer profile scraped to seed an agency_profile. */
export interface ScrapedProfile {
  name: string | null;
  title: string | null;
  bio: string | null;
  skills: string[];
  country: string | null;
  rawText: string;
}

/** A client message scraped from the Workana inbox. */
export interface ScrapedInboxMessage {
  /** Stable dedup key (thread slug + message hash). */
  externalId: string;
  threadUrl: string | null;
  /** Project slug from the thread URL (/messages/index/<slug>/<user>) — links to workana_projects. */
  projectSlug: string | null;
  projectTitle: string | null;
  fromName: string | null;
  body: string;
}

export interface ConnectStatus {
  phase: "idle" | "awaiting_login" | "connected" | "timeout" | "error";
  message?: string;
  startedAt?: number;
}
