import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "lexopen_session";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/health",
  "/api/integrations/google/callback",
];

function sessionSecret() {
  return (
    process.env.SESSION_SECRET ||
    process.env.GOOGLE_CLIENT_SECRET ||
    "lexopen-dev-session-secret-change-me"
  );
}

function toHex(buf: ArrayBuffer) {
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

async function hmacSha256Hex(payload: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload)
  );
  return toHex(sig);
}

async function verifyToken(token: string): Promise<boolean> {
  if (!token.includes(".")) {
    // Legacy cookie only allowed in development
    return process.env.NODE_ENV === "development";
  }
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [userId, expStr, sig] = parts;
  const expiresAt = Number(expStr);
  if (!userId || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = await hmacSha256Hex(`${userId}.${expiresAt}`);
  return timingSafeEqualHex(sig, expected);
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(svg|png|jpg|css|js|ico|webp)$/)
  ) {
    return NextResponse.next();
  }

  // Demo mode: allow unauthenticated access when explicitly enabled
  if (process.env.LEXOPEN_OPEN_ACCESS === "1") {
    return NextResponse.next();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token || !(await verifyToken(token))) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
