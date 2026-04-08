import { getSetting } from "@/db";
import { logger } from "@/lib/logger";
import type { ChatMessage, ToolDefinition, ChatResponse } from "./types";

// ─── Types matching the Anthropic SDK shape ─────────────────────────

interface ClaudeTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

interface ClaudeMessage {
  role: "user" | "assistant";
  content: string | ClaudeContentBlock[];
}

interface ClaudeContentBlock {
  type: "text" | "tool_use" | "tool_result";
  text?: string;
  id?: string;
  name?: string;
  input?: Record<string, unknown>;
  tool_use_id?: string;
  content?: string;
  is_error?: boolean;
}

interface ClaudeResponse {
  content: ClaudeContentBlock[];
  stop_reason: string;
}

// ─── Tool conversion ────────────────────────────────────────────────

function toClaudeTools(tools: ToolDefinition[]): ClaudeTool[] {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: {
      type: "object",
      ...tool.parameters,
    },
  }));
}

// ─── History conversion ─────────────────────────────────────────────

function toClaudeMessages(history: ChatMessage[]): ClaudeMessage[] {
  return history.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

// ─── Main chat function ─────────────────────────────────────────────

const MAX_TOOL_ROUNDS = 10;

export async function chatWithClaude(
  message: string,
  history: ChatMessage[],
  tools: ToolDefinition[],
  systemPrompt?: string
): Promise<ChatResponse> {
  // Dynamic import since @anthropic-ai/sdk is optional
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let Anthropic: any;
  try {
    // Use string variable to prevent TypeScript from resolving the module at compile time
    const sdkName = "@anthropic-ai/sdk";
    const mod = await import(/* webpackIgnore: true */ sdkName);
    Anthropic = mod.default || mod;
  } catch {
    throw new Error(
      "Anthropic SDK not installed. Run: npm install @anthropic-ai/sdk"
    );
  }

  const apiKey =
    getSetting("anthropic_api_key") || process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("Anthropic API key not configured");
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = new Anthropic({ apiKey }) as any;
  const claudeTools = toClaudeTools(tools);
  const toolCalls: { name: string; result: unknown }[] = [];

  // Build messages: history + new user message
  const messages: ClaudeMessage[] = [
    ...toClaudeMessages(history),
    { role: "user", content: message },
  ];

  let response = (await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    system: systemPrompt || "",
    tools: claudeTools,
    messages,
  })) as ClaudeResponse;

  // Process tool use loop
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const toolUseBlocks = response.content.filter(
      (block) => block.type === "tool_use"
    );

    if (toolUseBlocks.length === 0) break;

    // Execute each tool call and collect results
    const toolResults: ClaudeContentBlock[] = [];
    for (const block of toolUseBlocks) {
      const toolDef = tools.find((t) => t.name === block.name);

      if (!toolDef) {
        logger.warn({ toolName: block.name }, "Chatbot: unknown tool called");
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: `Unknown tool: ${block.name}` }),
          is_error: true,
        });
        continue;
      }

      try {
        const fnResult = await toolDef.handler(block.input || {});
        toolCalls.push({ name: block.name!, result: fnResult });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(fnResult),
        });
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(
          { tool: block.name, error: errorMsg },
          "Chatbot: tool execution failed"
        );
        toolCalls.push({
          name: block.name!,
          result: { error: errorMsg },
        });
        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify({ error: errorMsg }),
          is_error: true,
        });
      }
    }

    // Add assistant response + tool results as next messages
    messages.push({ role: "assistant", content: response.content });
    messages.push({ role: "user", content: toolResults });

    response = (await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 4096,
      system: systemPrompt || "",
      tools: claudeTools,
      messages,
    })) as ClaudeResponse;
  }

  // Extract the final text from the response
  const textBlocks = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text!)
    .filter(Boolean);

  return {
    message: textBlocks.join("\n") || "I completed the requested actions.",
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}
