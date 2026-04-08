import {
  streamText,
  stepCountIs,
  convertToModelMessages,
  type UIMessage,
} from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { chatbotTools } from "@/lib/chatbot/tools";

const SYSTEM_PROMPT = `You are ProspectAI's assistant. You help manage B2B outreach campaigns.
You can create campaigns, search for leads, review and approve emails,
check dashboard metrics, and manage settings.
Always be concise. If a user asks to do something, use the available tools.
Respond in the same language the user writes in.
When reporting results, use bullet points and bold for key data.`;

const google = createGoogleGenerativeAI({
  apiKey: process.env.GEMINI_API_KEY,
});

export async function POST(req: Request) {
  const { messages } = (await req.json()) as { messages: UIMessage[] };

  const modelMessages = await convertToModelMessages(messages, {
    tools: chatbotTools,
  });

  const result = streamText({
    model: google("gemini-2.5-flash"),
    system: SYSTEM_PROMPT,
    messages: modelMessages,
    tools: chatbotTools,
    stopWhen: stepCountIs(10),
  });

  return result.toUIMessageStreamResponse({
    originalMessages: messages,
  });
}
