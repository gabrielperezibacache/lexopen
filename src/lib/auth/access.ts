import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { prisma } from "@/lib/db";
import { getCurrentUser, requireUser } from "@/lib/auth/session";
import { canSeeConfidential, isCliente, isStaff } from "@/lib/auth/rbac";
import { clientSharedTagPrismaWhere } from "@/lib/auth/client-tags";

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
  return { confidencial: false, privilegio: false };
}

/** Files shared with clients must be tagged exact token `cliente` and non-confidential. */
export function clientVisibleFileWhere(role: string) {
  const base = confidentialFileWhere(role);
  if (!isCliente(role)) return base;
  return {
    AND: [base, clientSharedTagPrismaWhere()],
  };
}

export function isClientAllowedPath(pathname: string) {
  if (!pathname) return false;
  if (pathname === "/portal" || pathname.startsWith("/portal/")) return true;
  if (pathname === "/cuenta" || pathname.startsWith("/cuenta/")) return true;
  if (pathname === "/notificaciones" || pathname.startsWith("/notificaciones/"))
    return true;
  if (pathname === "/sites") return true;
  return /^\/sites\/[^/]+\/(archivos|qa)(?:\/.*)?$/.test(pathname);
}

/** Server layout gate for (app) routes. */
export async function enforceAppAccess() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const h = await headers();
  const path = h.get("x-lexopen-pathname") || "";

  // Fail closed: missing pathname header must not skip the client path gate.
  if (isCliente(user.role) && !isClientAllowedPath(path)) {
    redirect("/portal");
  }

  return user;
}

/** Page-level staff gate (redirects instead of throwing). */
export async function requireStaffPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!isStaff(user.role)) redirect("/portal");
  return user;
}
