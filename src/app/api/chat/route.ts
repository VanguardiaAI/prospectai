import { NextRequest, NextResponse } from "next/server";
import { getSetting } from "@/db";
import { chatbotTools } from "@/lib/chatbot/tools";
import { chatWithGemini } from "@/lib/chatbot/gemini-provider";
import type { ChatMessage } from "@/lib/chatbot/types";
import { logger } from "@/lib/logger";

const SYSTEM_PROMPT = `You are ProspectAI's assistant. You help manage B2B outreach campaigns.
You can create campaigns, search for leads, review and approve emails,
check dashboard metrics, and manage settings.
Always be concise. If a user asks to do something, use the available tools.
Respond in the same language the user writes in.`;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { message, history } = body as {
      message?: string;
      history?: ChatMessage[];
    };

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    const chatHistory: ChatMessage[] = Array.isArray(history) ? history : [];
    const provider = getSetting("chatbot_provider") || "gemini";

    let response;

    if (provider === "claude") {
      // Dynamic import to avoid errors when SDK is not installed
      try {
        const { chatWithClaude } = await import(
          "@/lib/chatbot/claude-provider"
        );
        response = await chatWithClaude(
          message.trim(),
          chatHistory,
          chatbotTools,
          SYSTEM_PROMPT
        );
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        logger.error({ error: errorMsg }, "Claude provider error");

        // Fall back to Gemini if Claude fails to load
        if (
          errorMsg.includes("not installed") ||
          errorMsg.includes("Cannot find module")
        ) {
          response = await chatWithGemini(
            message.trim(),
            chatHistory,
            chatbotTools,
            SYSTEM_PROMPT
          );
        } else {
          throw err;
        }
      }
    } else {
      response = await chatWithGemini(
        message.trim(),
        chatHistory,
        chatbotTools,
        SYSTEM_PROMPT
      );
    }

    return NextResponse.json({
      message: response.message,
      toolCalls: response.toolCalls,
    });
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : "Internal error";
    logger.error({ err }, "Chat API error");
    return NextResponse.json({ error: errorMsg }, { status: 500 });
  }
}
