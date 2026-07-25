import { cookies } from "next/headers";
import { createHmac, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/db";
import { canImpersonate, isStaff } from "@/lib/auth/rbac";

export const SESSION_COOKIE = "lexopen_session";
export const ROLE_COOKIE = "lexopen_role";
const SESSION_DAYS = 14;

export function sessionSecret() {
  const secret = process.env.SESSION_SECRET;
  if (secret && secret.length >= 16) return secret;
  if (process.env.NODE_ENV === "production") {
    throw new Error("SESSION_SECRET es obligatorio en producción (mín. 16 chars)");
  }
  return secret || "lexopen-dev-session-secret-change-me";
}

export function signSessionToken(userId: string, expiresAt: number) {
  const payload = `${userId}.${expiresAt}`;
  const sig = createHmac("sha256", sessionSecret()).update(payload).digest("hex");
  return `${payload}.${sig}`;
}

export function verifySessionToken(token: string): { userId: string; expiresAt: number } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [userId, expStr, sig] = parts;
  const expiresAt = Number(expStr);
  if (!userId || !Number.isFinite(expiresAt) || expiresAt < Date.now()) return null;
  const expected = createHmac("sha256", sessionSecret())
    .update(`${userId}.${expiresAt}`)
    .digest("hex");
  try {
    const a = Buffer.from(sig);
    const b = Buffer.from(expected);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  } catch {
    return null;
  }
  return { userId, expiresAt };
}

export async function getCurrentUser() {
  const jar = await cookies();
  const raw = jar.get(SESSION_COOKIE)?.value;
  if (!raw) return null;

  // Legacy unsigned cookie removed outside development
  if (!raw.includes(".")) {
    if (process.env.NODE_ENV === "development") {
      return prisma.user.findUnique({ where: { id: raw } });
    }
    return null;
  }

  const parsed = verifySessionToken(raw);
  if (!parsed) return null;
  return prisma.user.findUnique({ where: { id: parsed.userId } });
}

export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) {
    const err = new Error("No autenticado") as Error & { status: number };
    err.status = 401;
    throw err;
  }
  return user;
}

export async function requireStaff() {
  const user = await requireUser();
  if (!isStaff(user.role)) {
    const err = new Error("Prohibido") as Error & { status: number };
    err.status = 403;
    throw err;
  }
  return user;
}

export async function requireRole(...roles: string[]) {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    const err = new Error("Prohibido") as Error & { status: number };
    err.status = 403;
    throw err;
  }
  return user;
}

export async function listUsers() {
  if (!canImpersonate()) {
    const me = await getCurrentUser();
    return me ? [me] : [];
  }
  return prisma.user.findMany({ orderBy: { name: "asc" } });
}

export function buildSessionCookieValue(userId: string) {
  const expiresAt = Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000;
  return {
    value: signSessionToken(userId, expiresAt),
    maxAge: SESSION_DAYS * 24 * 60 * 60,
  };
}

export function newCsrfToken() {
  return randomBytes(16).toString("hex");
}
