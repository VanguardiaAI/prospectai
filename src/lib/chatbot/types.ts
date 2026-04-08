export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
  handler: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface ChatResponse {
  message: string;
  toolCalls?: { name: string; result: unknown }[];
}
