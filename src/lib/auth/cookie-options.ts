/**
 * Cookie Secure must follow the public URL scheme, not NODE_ENV alone.
 * Desktop Host often runs NODE_ENV=production over http:// Tailscale/LAN.
 */
export function cookieSecureFlag() {
  const explicit = process.env.LEXOPEN_COOKIE_SECURE;
  if (explicit === "1") return true;
  if (explicit === "0") return false;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.trim() || "";
  if (appUrl.startsWith("https://")) return true;
  if (appUrl.startsWith("http://")) return false;
  // No canonical URL: secure only for non-desktop production defaults.
  return (
    process.env.NODE_ENV === "production" && process.env.LEXOPEN_DESKTOP !== "1"
  );
}

export function baseCookieOptions(opts?: { httpOnly?: boolean; maxAge?: number }) {
  return {
    httpOnly: opts?.httpOnly ?? true,
    sameSite: "lax" as const,
    secure: cookieSecureFlag(),
    path: "/",
    ...(opts?.maxAge !== undefined ? { maxAge: opts.maxAge } : {}),
  };
}
