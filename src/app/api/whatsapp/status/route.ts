import { NextResponse } from "next/server";
import { getWhatsAppStatus, initializeWhatsApp, disconnectWhatsApp } from "@/lib/whatsapp-client";

// GET: return current WhatsApp connection status
export async function GET() {
  return NextResponse.json(getWhatsAppStatus());
}

// POST: connect or disconnect
export async function POST(req: Request) {
  const { action } = await req.json();

  if (action === "connect") {
    // Don't await - initialization runs in the background
    initializeWhatsApp();
    return NextResponse.json({ success: true, message: "Initializing..." });
  }

  if (action === "disconnect") {
    await disconnectWhatsApp();
    return NextResponse.json({ success: true, message: "Disconnected" });
  }

  return NextResponse.json({ error: "Invalid action" }, { status: 400 });
}
