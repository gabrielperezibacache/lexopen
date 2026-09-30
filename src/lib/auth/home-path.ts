/**
 * Post-login home by role.
 * Staff → /inicio (asistente operativo). Cliente → /portal.
 */

export const STAFF_HOME = "/inicio";
export const CLIENT_HOME = "/portal";
/** KPI hub retained as «Panel» — not the default landing. */
export const STAFF_PANEL = "/dashboard";

export function homePathForRole(role: string | null | undefined): string {
  if (role === "cliente") return CLIENT_HOME;
  return STAFF_HOME;
}

/**
 * If the user landed with a generic staff next path, prefer role home.
 * Explicit deep-links (e.g. /causas/…) are preserved.
 */
export function resolvePostLoginPath(
  role: string | null | undefined,
  next: string | null | undefined
): string {
  const raw = (next || "").trim() || STAFF_HOME;
  if (role === "cliente") {
    if (
      raw === STAFF_HOME ||
      raw === STAFF_PANEL ||
      raw === "/" ||
      raw.startsWith("/inicio") ||
      raw.startsWith("/dashboard")
    ) {
      return CLIENT_HOME;
    }
    return raw;
  }
  if (raw === STAFF_PANEL || raw === "/") return STAFF_HOME;
  return raw;
}
