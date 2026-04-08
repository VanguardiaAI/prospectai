import { streamText, stepCountIs } from "ai";
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
  const { messages } = await req.json();

  const result = streamText({
    model: google("gemini-2.5-flash-preview-05-20"),
    system: SYSTEM_PROMPT,
    messages,
    tools: chatbotTools,
    stopWhen: stepCountIs(10),
  });

  return result.toUIMessageStreamResponse();
}
