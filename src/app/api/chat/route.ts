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
import { getApiKey, db, getSetting } from "@/db";
import { campaigns } from "@/db/schema";
import { eq } from "drizzle-orm";
import { getAiProvider, type AiProvider } from "@/lib/ai/provider";
import { describePage } from "@/lib/chatbot/page-context";

const SYSTEM_PROMPT = `You are ProspectAI's assistant. You help manage B2B outreach campaigns.
You can set up the agency profile, create campaigns, search for leads, review and
approve messages, check dashboard metrics, and manage settings.
Always be concise. If a user asks to do something, use the available tools.
Respond in the same language the user writes in.
When reporting results, use bullet points and bold for key data.

PREFER ACTION: When the user is on a page, prefer performing that page's actions
for them via tools rather than explaining where to click — especially repetitive
work. Tie your suggestions to the current page and offer a concrete next step the
user can confirm in one message.

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

You CANNOT set secrets: API keys (Gemini/Resend/Anthropic) or SMTP/IMAP passwords —
for those, tell the user to open Settings → Connections. You CAN connect WhatsApp
yourself with connect_whatsapp (the QR appears in the chat to scan) and enable then
connect the Workana add-on with enable_workana_addon / connect_workana.`;

// Appended to the system prompt only for the claude_cli provider with developer
// mode ON. Lifts the sandbox: the agent may read/edit files, run shell and SQL.
const DEV_MODE_PROMPT = `

DEVELOPER MODE IS ON. This is the user's own local, single-user dev environment.
Beyond the ProspectAI tools you may use the native Read, Write, Edit, Bash, Glob and
Grep tools, plus query_database / execute_sql, to extend the app when no exact tool
or endpoint exists — e.g. create an API route, add a column, run a migration, or
inspect data. Follow the conventions in AGENTS.md, keep changes minimal and
consistent with the surrounding code, and briefly explain any destructive action
(file overwrite, DROP/DELETE, schema change) before doing it. File checkpointing is
on, so edits can be reverted.`;

// Native Claude Code tools unlocked in developer mode (claude_cli only).
const CLI_DEV_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "TodoWrite",
  "NotebookEdit",
];

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
function resolveChatModel(provider: AiProvider, devMode: boolean): ChatModel {
  if (provider === "claude_cli") {
    const mcpServers = {
      [CLI_MCP_SERVER_NAME]: createAiSdkMcpServer(
        CLI_MCP_SERVER_NAME,
        chatbotCliTools
      ),
    };
    // Developer mode lifts the sandbox: native file/shell tools auto-run with
    // bypassed permissions (localhost only). Otherwise stay fenced to the MCP
    // tools with everything else denied.
    const model = claudeCode(
      CLI_CHAT_MODEL,
      devMode
        ? {
            mcpServers,
            allowedTools: [...cliToolNames, ...CLI_DEV_TOOLS],
            permissionMode: "bypassPermissions",
            allowDangerouslySkipPermissions: true,
            enableFileCheckpointing: true,
            cwd: process.cwd(),
          }
        : {
            mcpServers,
            allowedTools: cliToolNames,
            disallowedTools: CLI_BLOCKED_TOOLS,
            permissionMode: "default",
          }
    ) as unknown as LanguageModel;
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
  // Developer mode (localhost-only power switch) only applies to the claude_cli
  // bridge, which can run native file/shell tools through the logged-in CLI.
  const provider = getAiProvider();
  const devMode =
    provider === "claude_cli" && getSetting("chatbot_dev_mode") === "true";

  let resolved: ChatModel;
  try {
    resolved = resolveChatModel(provider, devMode);
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

  const { messages, campaignId, path } = (await req.json()) as {
    messages: UIMessage[];
    campaignId?: number | null;
    path?: string | null;
  };

  let system = SYSTEM_PROMPT;

  // Page awareness: tell the agent what the current window is for and which tools
  // cover its actions, so answers are specific and it can offer to do the work.
  const pageBlock = describePage(path);
  if (pageBlock) system += `\n\n${pageBlock}`;

  // Developer mode unlocks the native toolset — describe it in the prompt too.
  if (devMode) system += DEV_MODE_PROMPT;

  // Global campaign scope: the UI tells us which campaign the user is viewing so
  // the agent scopes ambiguous requests to it (matching the dashboard/Review).
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

  // Code/SQL tasks in dev mode chain many tool calls, so allow more steps there.
  const maxSteps = devMode ? 30 : 10;

  // The claude_cli bridge ignores the `tools` option (it runs its own tool loop
  // via the in-process MCP server), so we only wire `tools` for the API providers.
  const result =
    resolved.kind === "cli"
      ? streamText({
          model: resolved.model,
          system,
          messages: await convertToModelMessages(messages),
          stopWhen: stepCountIs(maxSteps),
        })
      : streamText({
          model: resolved.model,
          system,
          messages: await convertToModelMessages(messages, { tools: chatbotTools }),
          tools: chatbotTools,
          stopWhen: stepCountIs(maxSteps),
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
