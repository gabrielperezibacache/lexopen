import { NextResponse } from "next/server";
import { ZodError, type ZodSchema } from "zod";
import {
  getCurrentUser,
  requireRole,
  requireStaff,
  requireUser,
} from "@/lib/auth/session";
import { canSeeConfidential, isCliente, isStaff } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";

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

export { getCurrentUser, requireUser, requireStaff, requireRole };

export async function assertStaffApi() {
  return requireStaff();
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

export async function requireSiteAccess(
  siteId: string,
  user: { id: string; role: string }
) {
  if (isStaff(user.role)) return;

  const site = await prisma.site.findUnique({
    where: { id: siteId },
    select: {
      id: true,
      isClientVisible: true,
      members: { where: { userId: user.id }, select: { id: true }, take: 1 },
    },
  });

  if (!site) {
    const err = new Error("Site no encontrado") as Error & { status: number };
    err.status = 404;
    throw err;
  }

  if (isCliente(user.role)) {
    if (site.isClientVisible || site.members.length > 0) return;
    const err = new Error("Acceso restringido") as Error & { status: number };
    err.status = 403;
    throw err;
  }

  const err = new Error("Prohibido") as Error & { status: number };
  err.status = 403;
  throw err;
}
