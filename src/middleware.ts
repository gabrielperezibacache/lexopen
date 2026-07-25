import { NextRequest, NextResponse } from "next/server";
import { createHmac, timingSafeEqual } from "crypto";

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

function verifyToken(token: string): boolean {
  if (!token.includes(".")) {
    // Legacy cookie only allowed in development
    return process.env.NODE_ENV === "development";
  }
  const parts = token.split(".");
  if (parts.length !== 3) return false;
  const [userId, expStr, sig] = parts;
  const expiresAt = Number(expStr);
  if (!userId || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return false;
  const expected = createHmac("sha256", sessionSecret())
    .update(`${userId}.${expiresAt}`)
    .digest("hex");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    return a.length === b.length && timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export function middleware(req: NextRequest) {
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
  if (!token || !verifyToken(token)) {
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
