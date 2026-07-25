import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import {
  getCurrentUser,
  requireRole,
  requireStaff,
  requireUser,
} from "@/lib/auth/session";
import {
  canManageBilling,
  canSeeConfidential,
  isCliente,
  isStaff,
} from "@/lib/auth/rbac";
import { requireSiteAccess, httpError } from "@/lib/auth/access";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleRouteError(e: unknown) {
  if (e && typeof e === "object" && "status" in e) {
    const status = Number((e as { status: number }).status) || 500;
    const message = e instanceof Error ? e.message : "Error";
    return jsonError(message, status);
  }
  if (e instanceof ZodError) {
    return jsonError(e.errors.map((x) => x.message).join("; "), 400);
  }
  console.error(e);
  return jsonError(e instanceof Error ? e.message : "Error interno", 500);
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>) {
  const body = await req.json().catch(() => ({}));
  return schema.parse(body);
}

export { getCurrentUser, requireUser, requireStaff, requireRole, requireSiteAccess };

export async function assertStaffApi() {
  return requireStaff();
}

export async function requireBillingManager() {
  const user = await requireUser();
  if (!canManageBilling(user.role)) {
    throw httpError("Prohibido: se requiere rol de facturación", 403);
  }
  return user;
}

export function confidentialWhere(userRole: string) {
  if (canSeeConfidential(userRole)) return {};
  return { confidencial: false };
}

export function portalBlockedResponse(userRole: string) {
  if (isCliente(userRole)) {
    return jsonError("Acceso restringido al portal cliente", 403);
  }
  return null;
}

export function staffOrForbid(userRole: string) {
  if (!isStaff(userRole)) return jsonError("Prohibido", 403);
  return null;
}

export function originMatches(candidate: string, allowed: string) {
  try {
    const a = new URL(allowed);
    const c = new URL(candidate);
    return a.protocol === c.protocol && a.host === c.host;
  } catch {
    return candidate === allowed;
  }
}

/** Origin/Referer CSRF check — exact host match (no startsWith spoofing). */
export function assertCsrf(req: Request) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return;
  }
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");
  if (!host) return;

  const allowed = [
    `http://${host}`,
    `https://${host}`,
    process.env.NEXT_PUBLIC_APP_URL,
  ].filter(Boolean) as string[];

  const okOrigin = Boolean(origin && allowed.some((a) => originMatches(origin, a)));
  const okReferer = Boolean(
    referer && allowed.some((a) => originMatches(referer, a))
  );

  if (!origin && !referer) {
    if (process.env.NODE_ENV === "production" && process.env.LEXOPEN_RELAX_CSRF !== "1") {
      throw httpError("CSRF: Origin/Referer requerido", 403);
    }
    return;
  }
  if (!okOrigin && !okReferer) {
    throw httpError("CSRF: origen no permitido", 403);
  }
}
