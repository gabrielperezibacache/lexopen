/**
 * Comparación estricta de orígenes CSRF (evita bypass por prefijo).
 */

export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return u.origin;
  } catch {
    return null;
  }
}

export function buildAllowedOrigins(opts: {
  host?: string | null;
  appUrl?: string | null;
  trustedCsv?: string | null;
  /** When false, Host is ignored (prefer fixed app/trusted origins). */
  trustHost?: boolean;
}): string[] {
  const trusted = (opts.trustedCsv || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => normalizeOrigin(s) || s.replace(/\/+$/, ""));

  const trustHost = opts.trustHost !== false;
  const fromHost =
    trustHost && opts.host
      ? [`http://${opts.host}`, `https://${opts.host}`]
      : [];
  const fromApp = opts.appUrl ? [normalizeOrigin(opts.appUrl) || opts.appUrl] : [];

  const all = [...fromHost, ...fromApp, ...trusted].filter(Boolean) as string[];
  return [...new Set(all.map((a) => a.replace(/\/+$/, "")))];
}

/** true si origin/referer coincide exactamente con un origen permitido. */
export function isAllowedOrigin(
  value: string | null | undefined,
  allowed: string[]
): boolean {
  const origin = normalizeOrigin(value);
  if (!origin) return false;
  return allowed.some((a) => {
    const allowedOrigin = normalizeOrigin(a) || a.replace(/\/+$/, "");
    return origin === allowedOrigin;
  });
}
