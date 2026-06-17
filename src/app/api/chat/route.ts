import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
  type LanguageModel,
} from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { chatbotTools } from "@/lib/chatbot/tools";
import { getApiKey } from "@/db";
import { getAiProvider } from "@/lib/ai/provider";

const SYSTEM_PROMPT = `You are ProspectAI's assistant. You help manage B2B outreach campaigns.
You can create campaigns, search for leads, review and approve emails,
check dashboard metrics, and manage settings.
Always be concise. If a user asks to do something, use the available tools.
Respond in the same language the user writes in.
When reporting results, use bullet points and bold for key data.`;

const ANTHROPIC_CHAT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";

/**
 * Resolve the chat model from the global `ai_provider` setting.
 *
 * The chatbot streams tool calls through the Vercel AI SDK, which the one-shot
 * `claude -p` CLI cannot drive — so when the provider is `claude_cli` we fall
 * back to an API provider that has a key configured (Anthropic preferred).
 */
function resolveChatModel(): LanguageModel {
  const provider = getAiProvider();
  const anthropicKey = getApiKey("anthropic_api_key", "ANTHROPIC_API_KEY");
  const geminiKey = getApiKey("gemini_api_key", "GEMINI_API_KEY");

  const effective = provider === "claude_cli" ? (anthropicKey ? "anthropic" : "gemini") : provider;

  if (effective === "anthropic") {
    if (!anthropicKey) {
      throw new Error("El chatbot requiere una Anthropic API Key. Configúrala en Configuración > Conexiones.");
    }
    return createAnthropic({ apiKey: anthropicKey })(ANTHROPIC_CHAT_MODEL);
  }

  if (!geminiKey) {
    throw new Error("El chatbot requiere una Gemini o Anthropic API Key. Configúrala en Configuración > Conexiones.");
  }
  return createGoogleGenerativeAI({ apiKey: geminiKey })("gemini-2.5-flash");
}

export async function POST(req: Request) {
  let model: LanguageModel;
  try {
    model = resolveChatModel();
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "No hay proveedor de IA configurado para el chatbot." }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const { messages } = (await req.json()) as { messages: UIMessage[] };

  const modelMessages = await convertToModelMessages(messages, {
    tools: chatbotTools,
  });

  const result = streamText({
    model,
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools: chatbotTools,
    stopWhen: stepCountIs(10),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
  });
}
