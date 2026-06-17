import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
  type LanguageModel,
} from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createAnthropic } from "@ai-sdk/anthropic";
import { claudeCode, createAiSdkMcpServer } from "ai-sdk-provider-claude-code";
import {
  chatbotTools,
  chatbotCliTools,
  cliToolNames,
  CLI_MCP_SERVER_NAME,
} from "@/lib/chatbot/tools";
import { getApiKey, db } from "@/db";
import { campaigns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAiProvider } from "@/lib/ai/provider";

const SYSTEM_PROMPT = `You are ProspectAI's assistant. You help manage B2B outreach campaigns.
You can set up the agency profile, create campaigns, search for leads, review and
approve messages, check dashboard metrics, and manage settings.
Always be concise. If a user asks to do something, use the available tools.
Respond in the same language the user writes in.
When reporting results, use bullet points and bold for key data.

SETUP ORDER (each step depends on the previous one — never skip ahead):
1. Agency profile — must exist before creating campaigns. If onboarding isn't
   complete, offer to fill it via update_profile (set completeOnboarding=true once
   at least the name is set). Check with get_profile.
2. Campaign — created with create_campaign. ALWAYS ask which channels it uses and
   pass channels: ["email"], ["whatsapp"], or both. Default to ["email"] only if
   the user has no preference.
3. Leads — searched/imported with start_search into an existing campaign. Don't
   search leads if there are no campaigns; create one first.
4. Then analyze → generate → review/approve → send.
If a prerequisite is missing, explain what's needed and offer to do that step first
instead of failing silently.

SERVICE WARNINGS: Use check_configuration. Only warn that EMAIL or WHATSAPP is
unconfigured when that service has required: true — i.e. at least one campaign uses
that channel. Never nag about a channel no campaign uses.

You CANNOT set secrets: API keys (Gemini/Resend/Anthropic), SMTP/IMAP passwords, or
the WhatsApp QR connection. For those, tell the user to open Settings (email/API
keys) or the WhatsApp section (scan QR) — you can only confirm what's missing.`;

const ANTHROPIC_CHAT_MODEL = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-6";
const CLI_CHAT_MODEL = process.env.CLAUDE_CLI_CHAT_MODEL || "sonnet";

// Built-in Claude Code tools the outreach agent must never touch. With
// `permissionMode: "default"` only `allowedTools` auto-run and anything else is
// denied (no interactive prompt is possible in headless mode); this denylist is
// belt-and-suspenders so the agent can't shell out or read/write the filesystem.
const CLI_BLOCKED_TOOLS = [
  "Bash",
  "Edit",
  "Write",
  "Read",
  "NotebookEdit",
  "WebFetch",
  "WebSearch",
  "Glob",
  "Grep",
  "Task",
  "TodoWrite",
];

type ChatModel =
  | { kind: "aisdk"; model: LanguageModel }
  | { kind: "cli"; model: LanguageModel };

/**
 * Resolve the chat model from the global `ai_provider` setting.
 *
 * All three providers drive the same Vercel AI SDK `useChat` UI:
 *   - `anthropic` / `gemini` → native AI SDK providers, tools run in-process.
 *   - `claude_cli`           → the `ai-sdk-provider-claude-code` bridge runs the
 *                              agent through the logged-in Claude CLI subscription
 *                              (no API key); our tools are exposed as an in-process
 *                              MCP server. No silent fallback to an API provider.
 */
function resolveChatModel(): ChatModel {
  const provider = getAiProvider();

  if (provider === "claude_cli") {
    const model = claudeCode(CLI_CHAT_MODEL, {
      mcpServers: {
        [CLI_MCP_SERVER_NAME]: createAiSdkMcpServer(
          CLI_MCP_SERVER_NAME,
          chatbotCliTools
        ),
      },
      allowedTools: cliToolNames,
      disallowedTools: CLI_BLOCKED_TOOLS,
      permissionMode: "default",
    }) as unknown as LanguageModel;
    return { kind: "cli", model };
  }

  if (provider === "anthropic") {
    const anthropicKey = getApiKey("anthropic_api_key", "ANTHROPIC_API_KEY");
    if (!anthropicKey) {
      throw new Error(
        "El chatbot requiere una Anthropic API Key. Configúrala en Configuración > Conexiones."
      );
    }
    return {
      kind: "aisdk",
      model: createAnthropic({ apiKey: anthropicKey })(ANTHROPIC_CHAT_MODEL),
    };
  }

  // gemini
  const geminiKey = getApiKey("gemini_api_key", "GEMINI_API_KEY");
  if (!geminiKey) {
    throw new Error(
      "El chatbot requiere una Gemini API Key. Configúrala en Configuración > Conexiones."
    );
  }
  return {
    kind: "aisdk",
    model: createGoogleGenerativeAI({ apiKey: geminiKey })("gemini-2.5-flash"),
  };
}

export async function POST(req: Request) {
  let resolved: ChatModel;
  try {
    resolved = resolveChatModel();
  } catch (err) {
    return new Response(
      JSON.stringify({
        error:
          err instanceof Error
            ? err.message
            : "No hay proveedor de IA configurado para el chatbot.",
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const { messages, campaignId } = (await req.json()) as {
    messages: UIMessage[];
    campaignId?: number | null;
  };

  // Global campaign scope: the UI tells us which campaign the user is viewing so
  // the agent scopes ambiguous requests to it (matching the dashboard/Review).
  let system = SYSTEM_PROMPT;
  if (campaignId != null && Number.isFinite(campaignId)) {
    const camp = db
      .select({ name: campaigns.name, channels: campaigns.channels, status: campaigns.status })
      .from(campaigns)
      .where(eq(campaigns.id, campaignId))
      .get();
    if (camp) {
      system += `\n\nCURRENT CONTEXT: The user is viewing the campaign "${camp.name}" (id ${campaignId}, channels: ${camp.channels}, status: ${camp.status}). Scope ambiguous requests — leads, drafts, replies, metrics, approvals — to this campaign by passing campaignId=${campaignId} to tools, unless the user explicitly asks about all campaigns or names another one.`;
    }
  }

  // The claude_cli bridge ignores the `tools` option (it runs its own tool loop
  // via the in-process MCP server), so we only wire `tools` for the API providers.
  const result =
    resolved.kind === "cli"
      ? streamText({
          model: resolved.model,
          system,
          messages: await convertToModelMessages(messages),
          stopWhen: stepCountIs(10),
        })
      : streamText({
          model: resolved.model,
          system,
          messages: await convertToModelMessages(messages, { tools: chatbotTools }),
          tools: chatbotTools,
          stopWhen: stepCountIs(10),
        });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
    // Surface a useful, actionable message to the client instead of the AI SDK's
    // default masked "An error occurred." The Claude CLI path fails here (not in
    // resolveChatModel) when the CLI isn't authenticated.
    onError: (error) => {
      const msg = error instanceof Error ? error.message : String(error);
      if (/login|auth|unauthor|credential|token/i.test(msg)) {
        return "El agente Claude CLI no está autenticado. Ejecuta `claude auth login` en el servidor, o cambia el proveedor de IA en Configuración.";
      }
      return msg;
    },
  });
}
