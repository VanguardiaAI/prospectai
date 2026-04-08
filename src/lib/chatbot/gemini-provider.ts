import { SchemaType } from "@google/generative-ai";
import type {
  FunctionDeclaration,
  FunctionDeclarationSchema,
  FunctionDeclarationSchemaProperty,
  Content,
  Part,
} from "@google/generative-ai";
import { genAI } from "@/lib/ai/config";
import { withRetry } from "@/lib/ai/retry";
import { logger } from "@/lib/logger";
import type { ChatMessage, ToolDefinition, ChatResponse } from "./types";

// ─── Schema conversion ──────────────────────────────────────────────

const JSON_TYPE_TO_SCHEMA: Record<string, SchemaType> = {
  string: SchemaType.STRING,
  number: SchemaType.NUMBER,
  integer: SchemaType.INTEGER,
  boolean: SchemaType.BOOLEAN,
  array: SchemaType.ARRAY,
  object: SchemaType.OBJECT,
};

function convertProperty(
  prop: Record<string, unknown>
): FunctionDeclarationSchemaProperty {
  const type = JSON_TYPE_TO_SCHEMA[(prop.type as string) || "string"] ?? SchemaType.STRING;
  const result: Record<string, unknown> = { type };

  if (prop.description) result.description = prop.description;
  if (prop.enum) result.enum = prop.enum;

  if (type === SchemaType.OBJECT && prop.properties) {
    const props: Record<string, FunctionDeclarationSchemaProperty> = {};
    for (const [key, val] of Object.entries(
      prop.properties as Record<string, Record<string, unknown>>
    )) {
      props[key] = convertProperty(val);
    }
    result.properties = props;
    if (prop.required) result.required = prop.required;
  }

  if (type === SchemaType.ARRAY && prop.items) {
    result.items = convertProperty(prop.items as Record<string, unknown>);
  }

  return result as unknown as FunctionDeclarationSchemaProperty;
}

function toGeminiFunctionDeclarations(
  tools: ToolDefinition[]
): FunctionDeclaration[] {
  return tools.map((tool) => {
    const params = tool.parameters as Record<string, unknown>;
    const properties = (params.properties || {}) as Record<
      string,
      Record<string, unknown>
    >;

    const convertedProps: Record<string, FunctionDeclarationSchemaProperty> = {};
    for (const [key, val] of Object.entries(properties)) {
      convertedProps[key] = convertProperty(val);
    }

    const schema: FunctionDeclarationSchema = {
      type: SchemaType.OBJECT,
      properties: convertedProps,
    };
    if (params.required) {
      schema.required = params.required as string[];
    }

    return {
      name: tool.name,
      description: tool.description,
      parameters: schema,
    };
  });
}

// ─── History conversion ─────────────────────────────────────────────

function toGeminiHistory(history: ChatMessage[]): Content[] {
  return history.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));
}

// ─── Main chat function ─────────────────────────────────────────────

const MAX_TOOL_ROUNDS = 10;

export async function chatWithGemini(
  message: string,
  history: ChatMessage[],
  tools: ToolDefinition[],
  systemPrompt?: string
): Promise<ChatResponse> {
  const functionDeclarations = toGeminiFunctionDeclarations(tools);

  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    tools: [{ functionDeclarations }],
    systemInstruction: systemPrompt,
  });

  const chat = model.startChat({
    history: toGeminiHistory(history),
  });

  const toolCalls: { name: string; result: unknown }[] = [];

  // Send the initial user message
  let result = await withRetry(() => chat.sendMessage(message), {
    label: "chatbot-gemini",
  });

  // Process function calling loop
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const candidate = result.response.candidates?.[0];
    if (!candidate) break;

    // Find all function call parts
    const fnCallParts = candidate.content.parts.filter(
      (p: Part) => p.functionCall
    );

    if (fnCallParts.length === 0) break;

    // Execute each function call
    const responseParts: Part[] = [];
    for (const part of fnCallParts) {
      const fnCall = part.functionCall!;
      const toolDef = tools.find((t) => t.name === fnCall.name);

      if (!toolDef) {
        logger.warn({ toolName: fnCall.name }, "Chatbot: unknown tool called");
        responseParts.push({
          functionResponse: {
            name: fnCall.name,
            response: { error: `Unknown tool: ${fnCall.name}` },
          },
        } as Part);
        continue;
      }

      try {
        const fnResult = await toolDef.handler(
          (fnCall.args as Record<string, unknown>) || {}
        );
        toolCalls.push({ name: fnCall.name, result: fnResult });
        responseParts.push({
          functionResponse: {
            name: fnCall.name,
            response: { result: fnResult },
          },
        } as Part);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error(
          { tool: fnCall.name, error: errorMsg },
          "Chatbot: tool execution failed"
        );
        toolCalls.push({ name: fnCall.name, result: { error: errorMsg } });
        responseParts.push({
          functionResponse: {
            name: fnCall.name,
            response: { error: errorMsg },
          },
        } as Part);
      }
    }

    // Send function responses back to the model
    result = await withRetry(() => chat.sendMessage(responseParts), {
      label: "chatbot-gemini-fn-response",
    });
  }

  // Extract the final text response
  const finalCandidate = result.response.candidates?.[0];
  const textParts =
    finalCandidate?.content.parts
      .filter((p: Part) => p.text)
      .map((p: Part) => p.text!) || [];

  return {
    message: textParts.join("\n") || "I completed the requested actions.",
    toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
  };
}
