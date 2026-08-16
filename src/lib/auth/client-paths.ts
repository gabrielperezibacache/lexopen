/**
 * Shared cliente allowlist for pages + APIs.
 * Used by layout (`access.ts`) and edge proxy — keep Edge-safe (no Node APIs).
 */

/** Page paths the portal role may open. */
export function isClientAllowedPagePath(pathname: string): boolean {
  if (!pathname) return false;
  if (pathname === "/portal" || pathname.startsWith("/portal/")) return true;
  if (pathname === "/cuenta" || pathname.startsWith("/cuenta/")) return true;
  if (pathname === "/notificaciones" || pathname.startsWith("/notificaciones/"))
    return true;
  if (pathname === "/sites") return true;
  return /^\/sites\/[^/]+\/(archivos|qa)(?:\/.*)?$/.test(pathname);
}

/** Auth API paths cliente may call (subset of /api/auth/*). */
const CLIENT_AUTH_API =
  /^\/api\/auth\/(me|logout|password|totp)(?:\/|$)/;

/** Full path allowlist for role=cliente (pages + APIs). */
export function isClientAllowedPath(pathname: string): boolean {
  if (isClientAllowedPagePath(pathname)) return true;
  if (pathname === "/api/sites") return true;
  if (/^\/api\/sites\/[^/]+\/(files|qa)(?:\/.*)?$/.test(pathname)) return true;
  if (pathname.startsWith("/api/notifications")) return true;
  if (CLIENT_AUTH_API.test(pathname)) return true;
  if (pathname === "/api/health") return true;
  if (pathname.startsWith("/api/search")) return true;
  return false;
}
