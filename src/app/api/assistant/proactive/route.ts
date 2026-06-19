import { NextResponse } from "next/server";
import { generateText, type LanguageModel } from "ai";
import { claudeCode } from "ai-sdk-provider-claude-code";
import { getAiProvider } from "@/lib/ai/provider";
import { getSetting } from "@/db";
import { getAssistantState, stateSignature } from "@/lib/chatbot/state";
import { describePage } from "@/lib/chatbot/page-context";

// Proactive nudges run on the cheaper Sonnet model (the user asked for a modest
// model). Only the claude_cli provider drives this — it has no per-call API cost.
const PROACTIVE_MODEL = process.env.CLAUDE_CLI_PROACTIVE_MODEL || "sonnet";

// Don't fire two nudges closer than this, even across page changes — keeps it from
// feeling chatty. Same (page + state) within the window is skipped without asking
// the model at all.
const MIN_GAP_MS = 90_000;

// Single-user local app: a module-level memory of the last nudge is enough to
// dedupe and rate-limit. (No multi-tenant concerns.)
let lastProactive: { signature: string; message: string; at: number } | null = null;

const SYSTEM = `You are ProspectAI's proactive assistant. The user just navigated to a page. Decide whether to nudge them RIGHT NOW with ONE short, useful suggestion that gets them to do something by chatting with you instead of by hand.

Rules:
- Reply with exactly "SKIP" (nothing else) if nothing meaningful changed, if it would just repeat your last nudge, or if there is no genuinely useful next action on this page.
- Otherwise reply with ONE sentence, max ~25 words, in the user's language (default neutral Spanish — no voseo, "dime" not "decime"). Name a concrete action the user can ask you to do. No greeting, no preamble, no quotes.`;

export async function POST(req: Request) {
  // Gate: claude_cli only, and only when the user has proactive nudges enabled.
  if (getAiProvider() !== "claude_cli") return NextResponse.json({ skip: true });
  if (getSetting("proactive_chat_enabled") !== "true") {
    return NextResponse.json({ skip: true });
  }

  const { path } = (await req.json().catch(() => ({}))) as { path?: string | null };
  const page = typeof path === "string" && path ? path : "/";

  const state = getAssistantState();
  const signature = stateSignature(page, state);
  const now = Date.now();

  // Time + state backstop: same situation seen recently → don't even ask the model.
  if (
    lastProactive &&
    lastProactive.signature === signature &&
    now - lastProactive.at < MIN_GAP_MS
  ) {
    return NextResponse.json({ skip: true });
  }

  const pageBlock = describePage(page) ?? `CURRENT PAGE: ${page}`;
  const last = lastProactive?.message
    ? `Your last nudge (${Math.round((now - lastProactive.at) / 1000)}s ago): "${lastProactive.message}"`
    : "You have not nudged the user yet this session.";

  const prompt = [
    pageBlock,
    "",
    "App state:",
    `- Agency profile configured: ${state.profile.configured}`,
    `- Campaigns: ${state.campaigns.count}`,
    `- Leads: ${state.leads.count}`,
    `- Drafts pending review: ${state.drafts.pending}`,
    `- Email service: ${state.services.email.configured ? "ready" : "not configured"}${state.services.email.required ? " (a campaign uses it)" : ""}`,
    `- WhatsApp: ${state.services.whatsapp.configured ? "connected" : "not connected"}${state.services.whatsapp.required ? " (a campaign uses it)" : ""}`,
    "",
    last,
    "",
    "Decide now: reply SKIP, or one short nudge.",
  ].join("\n");

  let text = "";
  try {
    const res = await generateText({
      // No tools: a pure one-shot text decision.
      model: claudeCode(PROACTIVE_MODEL, {
        maxTurns: 1,
        allowedTools: [],
      }) as unknown as LanguageModel,
      system: SYSTEM,
      prompt,
    });
    text = (res.text || "").trim();
  } catch {
    // CLI not authenticated / transient failure: silently skip, never block nav.
    return NextResponse.json({ skip: true });
  }

  // Model opted out (or returned nothing). Record the signature/time so we don't
  // immediately re-ask for the same unchanged state, but keep the prior message.
  if (!text || /^skip\b/i.test(text)) {
    lastProactive = { signature, message: lastProactive?.message ?? "", at: now };
    return NextResponse.json({ skip: true });
  }

  const message = text.replace(/^["'“”]+|["'“”]+$/g, "").trim();
  lastProactive = { signature, message, at: now };
  return NextResponse.json({ message });
}
