import { NextRequest, NextResponse } from "next/server";
import {
  validateCredentials,
  createSession,
  setSessionCookie,
  checkRateLimit,
  resetRateLimit,
} from "@/lib/auth";

export async function POST(req: NextRequest) {
  // Get client IP for rate limiting
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || "unknown";

  // Check rate limit
  const rateCheck = checkRateLimit(ip);
  if (!rateCheck.allowed) {
    return NextResponse.json(
      { error: "Too many attempts", retryAfter: rateCheck.retryAfter },
      { status: 429 }
    );
  }

  try {
    const body = await req.json();
    const { username, password } = body;

    if (!username || !password) {
      return NextResponse.json(
        { error: "Username and password required" },
        { status: 400 }
      );
    }

    const valid = await validateCredentials(username, password);

    if (!valid) {
      return NextResponse.json(
        { error: "Invalid credentials" },
        { status: 401 }
      );
    }

    // Reset rate limiter on successful login
    resetRateLimit(ip);

    // Create session and set cookie
    const token = await createSession(username);
    await setSessionCookie(token);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Login error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
