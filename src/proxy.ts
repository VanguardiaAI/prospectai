import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { jwtVerify } from "jose";

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/track/open",
  "/api/track/click",
  "/api/unsubscribe",
  "/api/webhooks/resend",
  "/api/whatsapp/status",
];

// Static file patterns to skip
const SKIP_PATTERNS = [
  "/_next/",
  "/favicon.ico",
  "/sitemap.xml",
  "/robots.txt",
];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(route + "/")
  );
}

function isStaticAsset(pathname: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pathname.startsWith(pattern));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip static assets
  if (isStaticAsset(pathname)) {
    return NextResponse.next();
  }

  // Allow public routes
  if (isPublicRoute(pathname)) {
    // If already logged in and visiting /login, redirect to dashboard
    if (pathname === "/login") {
      const token = request.cookies.get("prospect_session")?.value;
      if (token) {
        try {
          const secret = new TextEncoder().encode(
            process.env.AUTH_SECRET || ""
          );
          await jwtVerify(token, secret);
          return NextResponse.redirect(new URL("/", request.url));
        } catch {
          // Invalid token, let them see login page
        }
      }
    }
    return NextResponse.next();
  }

  // Protect /api/cron with CRON_SECRET
  if (pathname === "/api/cron") {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader === `Bearer ${cronSecret}`) {
      return NextResponse.next();
    }

    // Also check session cookie for manual cron triggers from dashboard
    const token = request.cookies.get("prospect_session")?.value;
    if (token) {
      try {
        const secret = new TextEncoder().encode(
          process.env.AUTH_SECRET || ""
        );
        await jwtVerify(token, secret);
        return NextResponse.next();
      } catch {
        // Fall through to 401
      }
    }

    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Check session for all other routes
  const token = request.cookies.get("prospect_session")?.value;

  if (!token) {
    // API routes get 401, pages get redirected to login
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      );
    }
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("from", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Verify JWT
  try {
    const secret = new TextEncoder().encode(process.env.AUTH_SECRET || "");
    await jwtVerify(token, secret);

    // Add security headers to all responses
    const response = NextResponse.next();

    return response;
  } catch {
    // Invalid/expired token
    const response = pathname.startsWith("/api/")
      ? NextResponse.json({ error: "Session expired" }, { status: 401 })
      : NextResponse.redirect(new URL("/login", request.url));

    // Clear invalid cookie
    response.cookies.delete("prospect_session");
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, sitemap.xml, robots.txt (metadata files)
     */
    "/((?!_next/static|_next/image|favicon.ico|sitemap.xml|robots.txt).*)",
  ],
};
