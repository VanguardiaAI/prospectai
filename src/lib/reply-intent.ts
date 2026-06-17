// Shared (client + server safe) metadata for AI-classified reply intent.
// No imports so it can be used by the DB ingestion, the API, and React UI alike.

export const REPLY_INTENTS = [
  "interested",
  "question",
  "not_interested",
  "auto_reply",
  "unsubscribe",
  "other",
] as const;

export type ReplyIntent = (typeof REPLY_INTENTS)[number];

// Visual tone within the design system (orange / gray / green only):
//   good → success green (a genuine status win), warn → orange accent
//   (needs attention), muted → neutral gray.
export const INTENT_TONE: Record<ReplyIntent, "good" | "warn" | "muted"> = {
  interested: "good",
  question: "warn",
  not_interested: "muted",
  auto_reply: "muted",
  unsubscribe: "warn",
  other: "muted",
};

export function isReplyIntent(v: unknown): v is ReplyIntent {
  return typeof v === "string" && (REPLY_INTENTS as readonly string[]).includes(v);
}
