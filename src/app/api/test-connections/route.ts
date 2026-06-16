import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { testConnection as testResend } from "@/lib/resend-client";
import { getWhatsAppStatus } from "@/lib/whatsapp-client";
import { getApiKey } from "@/db";

export async function GET() {
  const results: Record<string, { ok: boolean; error?: string }> = {};

  // Test Gemini
  try {
    const genAI = new GoogleGenerativeAI(getApiKey("gemini_api_key", "GEMINI_API_KEY"));
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
    await model.generateContent("Responde solo: OK");
    results.gemini = { ok: true };
  } catch (err) {
    results.gemini = { ok: false, error: err instanceof Error ? err.message : "Connection failed" };
  }

  // Test Resend
  const resendResult = await testResend();
  results.resend = { ok: resendResult.success, error: resendResult.error };

  // Test WhatsApp
  const waStatus = getWhatsAppStatus();
  results.whatsapp = {
    ok: waStatus.status === "ready",
    error: waStatus.status !== "ready" ? (waStatus.error || `Estado: ${waStatus.status}`) : undefined,
  };

  // Test Python/Scrapling
  try {
    const { execFile } = await import("child_process");
    const { promisify } = await import("util");
    const exec = promisify(execFile);
    const pythonCmd = process.env.PYTHON_PATH || "python3";
    await exec(pythonCmd, ["-c", "import scrapling; print('OK')"], { timeout: 10000 });
    results.scrapling = { ok: true };
  } catch (err) {
    results.scrapling = { ok: false, error: err instanceof Error ? err.message : "Not available" };
  }

  return NextResponse.json(results);
}
