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
import {
  buildAllowedOrigins,
  isAllowedOrigin,
  normalizeOrigin,
} from "@/lib/csrf";

export function jsonError(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

export function handleRouteError(e: unknown) {
  if (e && typeof e === "object" && "status" in e) {
    const status = Number((e as { status: number }).status) || 500;
    const message =
      status >= 500 && process.env.NODE_ENV === "production"
        ? "Error interno"
        : e instanceof Error
          ? e.message
          : "Error";
    return jsonError(message, status);
  }
  if (e instanceof ZodError) {
    return jsonError(e.errors.map((x) => x.message).join("; "), 400);
  }
  console.error(e);
  return jsonError(
    process.env.NODE_ENV === "production"
      ? "Error interno"
      : e instanceof Error
        ? e.message
        : "Error interno",
    500
  );
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>) {
  const body = await req.json().catch(() => ({}));
  return schema.parse(body);
}

export {
  getCurrentUser,
  requireUser,
  requireStaff,
  requireRole,
  requireSiteAccess,
  httpError,
};

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
  return { confidencial: false, privilegio: false };
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

/** Origin/Referer CSRF check for mutating API requests. */
export function assertCsrf(req: Request) {
  if (req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS") {
    return;
  }
  const origin = req.headers.get("origin");
  const referer = req.headers.get("referer");
  const host = req.headers.get("host");
  if (!host) {
    if (process.env.NODE_ENV === "production") {
      throw httpError("CSRF: Host requerido", 403);
    }
    return;
  }

  const allowed = buildAllowedOrigins({
    host,
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    trustedCsv: process.env.LEXOPEN_TRUSTED_ORIGINS,
  });

  const okOrigin = isAllowedOrigin(origin, allowed);
  const okReferer = isAllowedOrigin(referer, allowed);

  // Same-origin fetch from browser usually sends Origin; server-to-server may not.
  // LEXOPEN_RELAX_CSRF is ignored in production (fail-closed).
  if (!origin && !referer) {
    if (process.env.NODE_ENV === "production") {
      throw httpError("CSRF: Origin/Referer requerido", 403);
    }
    return;
  }
  if (!okOrigin && !okReferer) {
    throw httpError("CSRF: origen no permitido", 403);
  }
}

export { normalizeOrigin };
