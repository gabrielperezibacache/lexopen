import { NextRequest, NextResponse } from "next/server";
import { buildContentSecurityPolicy } from "@/lib/security/headers";
import { sessionVersionMatches } from "@/lib/auth/session-version";
import {
  RECOVERY_TOKEN_COOKIE,
  SETUP_TOKEN_COOKIE,
  setupCookieOptions,
} from "@/lib/auth/setup-cookies";
import { isAuthorizedCronRequest } from "@/lib/security/cron-paths";
import { createHmac, timingSafeEqual } from "node:crypto";
import { isStrongSessionSecret } from "@/lib/security/production-env";
import { isClientAllowedPath } from "@/lib/auth/client-paths";
import { PORTAL_ROLES, VALID_ROLE_SET } from "@/lib/auth/roles";
import {
  isTwoFactorExemptPath,
  mustEnrollTwoFactor,
  TWO_FACTOR_REQUIRED_CODE,
} from "@/lib/auth/two-factor-policy";

const SESSION_COOKIE = "lexopen_session";
const CSRF_COOKIE = "lexopen_csrf";

const PUBLIC_PATHS = [
  "/",
  "/login",
  "/setup",
  "/recovery",
  "/api/auth/login",
  "/api/auth/logout",
  "/api/auth/totp",
  "/api/setup",
  "/api/auth/recover",
  "/api/integrations/pjud/webhook",
  "/api/health",
  "/api/locale",
];

const VALID_ROLES = VALID_ROLE_SET as Set<string>;

function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (isStrongSessionSecret(secret)) return secret!.trim();
  return "";
}

function verifyHmacSha256Hex(payload: string, signatureHex: string, secret: string) {
  if (signatureHex.length !== 64) return false;
  try {
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    const a = createHmac("sha256", secret).update(signatureHex).digest();
    const b = createHmac("sha256", secret).update(expected).digest();
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function lookupSessionVersion(userId: string) {
  try {
    const { prisma } = await import("@/lib/db");
    return await prisma.user.findUnique({
      where: { id: userId },
      select: { sessionVersion: true, role: true, totpEnabled: true },
    });
  } catch (error) {
    console.warn("[proxy] session lookup failed", error);
    return null;
  }
}

let twoFactorPolicyCache: { value: boolean; at: number } | null = null;
const TWO_FACTOR_POLICY_TTL_MS = 30_000;

/** `FirmSettings.require2faPrivileged` (default true). Fail-closed ante error. */
async function lookupTwoFactorPolicy() {
  const now = Date.now();
  if (twoFactorPolicyCache && now - twoFactorPolicyCache.at < TWO_FACTOR_POLICY_TTL_MS) {
    return twoFactorPolicyCache.value;
  }
  try {
    const { prisma } = await import("@/lib/db");
    const settings = await prisma.firmSettings.findFirst({
      select: { require2faPrivileged: true },
    });
    const value = settings ? settings.require2faPrivileged : true;
    twoFactorPolicyCache = { value, at: now };
    return value;
  } catch (error) {
    console.warn("[proxy] 2FA policy lookup failed", error);
    return true;
  }
}

async function verifyToken(
  token: string
): Promise<{ userId: string; role: string; totpEnabled: boolean } | null> {
  const secret = sessionSecret();
  if (!secret) return null;
  if (!token.includes(".")) return null;
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
  const ok = verifyHmacSha256Hex(
    `${userId}.${expiresAt}.${sessionVersion}.${role}`,
    sig,
    secret
  );
  if (!ok) return null;

  const row = await lookupSessionVersion(userId);
  const matched = sessionVersionMatches(row, sessionVersion, VALID_ROLES);
  if (!matched.ok) return null;
  // Prefer DB role so ACL tracks role changes after session minting.
  return { userId, role: matched.role, totpEnabled: Boolean(row?.totpEnabled) };
}

function cookieSecureFlag() {
  const explicit = process.env.LEXOPEN_COOKIE_SECURE;
  if (explicit === "1") return true;
  if (explicit === "0") return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  if (appUrl.startsWith("https://")) return true;
  if (appUrl.startsWith("http://")) return false;
  return (
    process.env.NODE_ENV === "production" && process.env.LEXOPEN_DESKTOP !== "1"
  );
}

function newEdgeCsrfToken() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function newCspNonce() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function httpsEnabled() {
  return Boolean(process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://"));
}

function newRequestId() {
  const bytes = new Uint8Array(8);
  crypto.getRandomValues(bytes);
  const rand = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${Date.now().toString(36)}-${rand}`;
}

function withSecurityHeaders(
  req: NextRequest,
  res: NextResponse,
  nonce: string,
  requestId: string
) {
  const csp = buildContentSecurityPolicy({
    https: httpsEnabled(),
    nonce,
    isDev: process.env.NODE_ENV === "development",
  });
  res.headers.set("Content-Security-Policy", csp);
  res.headers.set("x-request-id", requestId);
  if (!req.cookies.get(CSRF_COOKIE)?.value) {
    res.cookies.set(CSRF_COOKIE, newEdgeCsrfToken(), {
      httpOnly: false,
      sameSite: "lax",
      secure: cookieSecureFlag(),
      path: "/",
      maxAge: 14 * 24 * 60 * 60,
    });
  }
  return res;
}

function attachRequestNonce(req: NextRequest, nonce: string, requestId: string) {
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-lexopen-pathname", req.nextUrl.pathname);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("x-request-id", requestId);
  requestHeaders.set(
    "Content-Security-Policy",
    buildContentSecurityPolicy({
      https: httpsEnabled(),
      nonce,
      isDev: process.env.NODE_ENV === "development",
    })
  );
  return requestHeaders;
}

/** Move ?token= into an httpOnly cookie and redirect to a clean URL. */
function migrateQueryToken(req: NextRequest, nonce: string, requestId: string) {
  const { pathname } = req.nextUrl;
  if (pathname !== "/setup" && pathname !== "/recovery") return null;
  if (!req.nextUrl.searchParams.has("token")) return null;

  const token = String(req.nextUrl.searchParams.get("token") || "").slice(0, 256);
  const clean = req.nextUrl.clone();
  clean.searchParams.delete("token");
  const res = withSecurityHeaders(
    req,
    NextResponse.redirect(clean),
    nonce,
    requestId
  );
  if (token) {
    const name =
      pathname === "/setup" ? SETUP_TOKEN_COOKIE : RECOVERY_TOKEN_COOKIE;
    res.cookies.set(name, token, setupCookieOptions(cookieSecureFlag()));
  }
  return res;
}

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const nonce = newCspNonce();
  const requestId =
    req.headers.get("x-request-id")?.trim() || newRequestId();
  const requestHeaders = attachRequestNonce(req, nonce, requestId);

  const migrated = migrateQueryToken(req, nonce, requestId);
  if (migrated) return migrated;

  const pass = () =>
    withSecurityHeaders(
      req,
      NextResponse.next({
        request: { headers: requestHeaders },
      }),
      nonce,
      requestId
    );

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

  // Host schedulers authenticate with x-cron-secret (no session cookie).
  if (
    isAuthorizedCronRequest(pathname, req.headers.get("x-cron-secret"))
  ) {
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
      return withSecurityHeaders(
        req,
        NextResponse.json({ error: "No autenticado" }, { status: 401 }),
        nonce,
        requestId
      );
    }
    const login = new URL("/login", req.url);
    login.searchParams.set("next", pathname);
    return withSecurityHeaders(
      req,
      NextResponse.redirect(login),
      nonce,
      requestId
    );
  }

  // Role ACL comes from the DB-backed session — never from a forgeable cookie.
  if (
    !isTwoFactorExemptPath(pathname) &&
    mustEnrollTwoFactor({
      role: session.role,
      totpEnabled: session.totpEnabled,
      policyEnabled: await lookupTwoFactorPolicy(),
    })
  ) {
    if (pathname.startsWith("/api/")) {
      return withSecurityHeaders(
        req,
        NextResponse.json(
          {
            error:
              "Su rol requiere verificación en dos pasos. Actívela en Mi cuenta para continuar.",
            code: TWO_FACTOR_REQUIRED_CODE,
          },
          { status: 403 }
        ),
        nonce,
        requestId
      );
    }
    const setup = new URL("/cuenta", req.url);
    setup.searchParams.set("requiere2fa", "1");
    return withSecurityHeaders(req, NextResponse.redirect(setup), nonce, requestId);
  }

  if (
    (PORTAL_ROLES as readonly string[]).includes(session.role) &&
    !isClientAllowedPath(pathname)
  ) {
    if (pathname.startsWith("/api/")) {
      return withSecurityHeaders(
        req,
        NextResponse.json(
          { error: "Acceso restringido al portal cliente" },
          { status: 403 }
        ),
        nonce,
        requestId
      );
    }
    return withSecurityHeaders(
      req,
      NextResponse.redirect(new URL("/portal", req.url)),
      nonce,
      requestId
    );
  }

  return pass();
}

export const config = {
  matcher: [
    {
      source: "/((?!_next/static|_next/image).*)",
      missing: [
        { type: "header", key: "next-router-prefetch" },
        { type: "header", key: "purpose", value: "prefetch" },
      ],
    },
  ],
};
