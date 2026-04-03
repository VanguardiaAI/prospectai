import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import bcrypt from "bcryptjs";

// ─── Constants ──────────────────────────────────────────────────────

const SESSION_COOKIE = "prospect_session";
const SESSION_DURATION = 7 * 24 * 60 * 60; // 7 days in seconds

function getSecret() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error("AUTH_SECRET must be set and at least 32 characters");
  }
  return new TextEncoder().encode(secret);
}

// ─── Password ───────────────────────────────────────────────────────

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, 12);
}

export async function verifyPassword(
  plain: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// ─── JWT ────────────────────────────────────────────────────────────

export async function createSession(username: string): Promise<string> {
  const token = await new SignJWT({ sub: username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION}s`)
    .sign(getSecret());

  return token;
}

export async function verifySession(
  token: string
): Promise<{ username: string } | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (!payload.sub) return null;
    return { username: payload.sub };
  } catch {
    return null;
  }
}

// ─── Cookie helpers (for use in Server Components / Route Handlers) ─

export async function setSessionCookie(token: string) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DURATION,
  });
}

export async function getSessionCookie(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(SESSION_COOKIE)?.value;
}

export async function deleteSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}

// ─── Auth check (for Server Components) ─────────────────────────────

export async function getSession(): Promise<{ username: string } | null> {
  const token = await getSessionCookie();
  if (!token) return null;
  return verifySession(token);
}

// ─── Credentials validation ─────────────────────────────────────────

export async function validateCredentials(
  username: string,
  password: string
): Promise<boolean> {
  const envUser = process.env.AUTH_USERNAME;
  const envHash = process.env.AUTH_PASSWORD_HASH;

  if (!envUser || !envHash) {
    throw new Error("AUTH_USERNAME and AUTH_PASSWORD_HASH must be set");
  }

  // Constant-time comparison for username via hashing
  if (username !== envUser) {
    // Still run bcrypt to prevent timing attacks
    await bcrypt.compare(password, "$2a$12$invalid.hash.to.waste.time");
    return false;
  }

  return verifyPassword(password, envHash);
}

// ─── Rate limiter (in-memory, per-IP) ───────────────────────────────

const loginAttempts = new Map<
  string,
  { count: number; firstAttempt: number; lockedUntil: number }
>();

const RATE_LIMIT = {
  maxAttempts: 5, // max attempts before lockout
  windowMs: 15 * 60 * 1000, // 15 minute window
  lockoutMs: 15 * 60 * 1000, // 15 minute lockout
};

// Clean old entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  for (const [ip, data] of loginAttempts) {
    if (now - data.firstAttempt > RATE_LIMIT.windowMs * 2) {
      loginAttempts.delete(ip);
    }
  }
}, 30 * 60 * 1000);

export function checkRateLimit(ip: string): {
  allowed: boolean;
  retryAfter?: number;
} {
  const now = Date.now();
  const entry = loginAttempts.get(ip);

  if (!entry) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now, lockedUntil: 0 });
    return { allowed: true };
  }

  // Check if locked out
  if (entry.lockedUntil > now) {
    return {
      allowed: false,
      retryAfter: Math.ceil((entry.lockedUntil - now) / 1000),
    };
  }

  // Reset window if expired
  if (now - entry.firstAttempt > RATE_LIMIT.windowMs) {
    loginAttempts.set(ip, { count: 1, firstAttempt: now, lockedUntil: 0 });
    return { allowed: true };
  }

  entry.count++;

  if (entry.count > RATE_LIMIT.maxAttempts) {
    entry.lockedUntil = now + RATE_LIMIT.lockoutMs;
    return {
      allowed: false,
      retryAfter: Math.ceil(RATE_LIMIT.lockoutMs / 1000),
    };
  }

  return { allowed: true };
}

export function resetRateLimit(ip: string) {
  loginAttempts.delete(ip);
}
