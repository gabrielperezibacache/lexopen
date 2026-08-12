import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "lexopen_session";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/setup",
  "/recovery",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/setup",
  "/api/auth/recover",
  "/api/integrations/pjud/webhook",
  "/api/health",
];

const VALID_ROLES = new Set(["admin", "abogado", "asistente", "cliente"]);

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "production") {
    return "";
  }
  return secret || "lexopen-dev-session-secret-change-me";
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

async function hmacSha256Hex(payload: string, secret: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
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

async function verifyToken(
  token: string
): Promise<{ userId: string; role: string } | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  if (!token.includes(".")) {
    // Legacy unsigned cookie: no trusted role in Edge; treat as non-client.
    return process.env.NODE_ENV === "development"
      ? { userId: token, role: "abogado" }
      : null;
  }
  const parts = token.split(".");
  if (parts.length !== 5) return null;
  const [userId, expStr, versionStr, role, sig] = parts;
  const expiresAt = Number(expStr);
  const sessionVersion = Number(versionStr);
  if (
    !userId ||
    !Number.isFinite(expiresAt) ||
    expiresAt < Date.now() ||
    !Number.isInteger(sessionVersion) ||
    sessionVersion < 0 ||
    !VALID_ROLES.has(role)
  ) {
    return null;
  }
  const expected = await hmacSha256Hex(
    `${userId}.${expiresAt}.${sessionVersion}.${role}`,
    secret
  );
  if (!timingSafeEqualHex(sig, expected)) return null;
  return { userId, role };
}

function isClientAllowedPath(pathname: string) {
  return (
    pathname === "/portal" ||
    pathname.startsWith("/portal/") ||
    pathname === "/cuenta" ||
    pathname.startsWith("/cuenta/") ||
    pathname === "/sites" ||
    /^\/sites\/[^/]+\/(archivos|qa)(?:\/.*)?$/.test(pathname) ||
    pathname === "/api/sites" ||
    /^\/api\/sites\/[^/]+\/(files|qa)(?:\/.*)?$/.test(pathname) ||
    pathname.startsWith("/api/notifications") ||
    pathname.startsWith("/api/auth/") ||
    pathname === "/api/health" ||
    pathname.startsWith("/api/search")
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-lexopen-pathname", pathname);

  const pass = () =>
    NextResponse.next({
      request: { headers: requestHeaders },
    });

  if (
    PUBLIC_PATHS.includes(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    pathname.match(/\.(svg|png|jpg|css|js|ico|webp)$/)
  ) {
    return pass();
  }

  // Google OAuth callback stays public but must still pass pathname header
  if (pathname === "/api/integrations/google/callback") {
    return pass();
  }

  // Open access NEVER in production
  if (
    process.env.LEXOPEN_OPEN_ACCESS === "1" &&
    process.env.NODE_ENV !== "production"
  ) {
    return pass();
  }

  const token = req.cookies.get(SESSION_COOKIE)?.value;
  const session = token ? await verifyToken(token) : null;
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname);
    return NextResponse.redirect(login);
  }

  // Role ACL comes from the signed session token — never from a forgeable cookie.
  if (session.role === "cliente" && !isClientAllowedPath(pathname)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json(
        { error: "Acceso restringido al portal cliente" },
        { status: 403 }
      );
    }
    return NextResponse.redirect(new URL("/portal", req.url));
  }

  return pass();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image).*)"],
};
