import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { canSeeConfidential, isCliente, isStaff } from "@/lib/auth/rbac";

/** Server pages that must be staff-only (defense in depth beyond layout). */
export async function requireStaffPage() {
  const user = await requireUser();
  if (!isStaff(user.role)) redirect("/portal");
  return user;
}

export function httpError(message: string, status: number) {
  const err = new Error(message) as Error & { status: number };
  err.status = status;
  return err;
}

/** Cliente: debe ser miembro Y el site visible. Staff: libre. */
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

  if (!site) throw httpError("Site no encontrado", 404);

  if (isCliente(user.role)) {
    if (site.isClientVisible && site.members.length > 0) return;
    throw httpError("Acceso restringido", 403);
  }

  throw httpError("Prohibido", 403);
}

export async function assertSitePageAccess(siteId: string) {
  const user = await requireUser();
  await requireSiteAccess(siteId, user);
  return user;
}

export function clientSiteWhere(userId: string) {
  return {
    isClientVisible: true,
    members: { some: { userId } },
  };
}

export function confidentialFileWhere(role: string) {
  if (canSeeConfidential(role)) return {};
  return { confidencial: false };
}

export function clientVisibleFileWhere() {
  return {
    confidencial: false,
    tags: { contains: "cliente", mode: "insensitive" as const },
  };
}

export function siteFileWhereForRole(role: string) {
  if (isCliente(role)) return clientVisibleFileWhere();
  return confidentialFileWhere(role);
}

const CLIENT_ALLOWED_PREFIXES = ["/portal", "/sites", "/notificaciones"];

export function isClientAllowedPath(pathname: string) {
  if (!pathname) return true;
  return CLIENT_ALLOWED_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/** Server layout gate for (app) routes. */
export async function enforceAppAccess() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const h = await headers();
  const path = h.get("x-lexopen-pathname") || "";

  if (isCliente(user.role) && path && !isClientAllowedPath(path)) {
    redirect("/portal");
  }

  return user;
}
