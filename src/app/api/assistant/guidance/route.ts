import { NextResponse } from "next/server";
import { handleServiceError } from "@/services/api-handler";
import { getAssistantState } from "@/lib/chatbot/state";

// State the chatbot shortcuts render against. Tells the UI (and indirectly the
// user) what's done, what's available, and what's still missing — including the
// channel-gated service warnings (only flag email/WhatsApp when a campaign uses it).
export async function GET() {
  try {
    return NextResponse.json(getAssistantState());
  } catch (err) {
    return handleServiceError(err);
  }
}
