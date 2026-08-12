/**
 * Best-effort loopback detection for health / bootstrap probes.
 * Prefer staff auth for sensitive fields; this only gates Desktop/local UX.
 */

function normalizeIp(raw: string) {
  const v = raw.trim().toLowerCase();
  if (v.startsWith("::ffff:")) return v.slice(7);
  return v;
}

export function isLoopbackIp(ip: string | null | undefined) {
  if (!ip) return false;
  const v = normalizeIp(ip);
  return (
    v === "127.0.0.1" ||
    v === "::1" ||
    v === "localhost" ||
    v === "0:0:0:0:0:0:0:1"
  );
}

export function isLoopbackHostname(host: string | null | undefined) {
  if (!host) return false;
  const hostname = host.split(":")[0]?.trim().toLowerCase() || "";
  return (
    hostname === "127.0.0.1" ||
    hostname === "localhost" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

/** True when the request looks like a local Desktop / web-host probe. */
export function isLoopbackHttpRequest(req: {
  headers: { get(name: string): string | null };
}) {
  const host = req.headers.get("host");
  if (isLoopbackHostname(host)) return true;

  // Only trust forwarded client IPs behind an explicit reverse proxy.
  if (process.env.LEXOPEN_TRUSTED_PROXY === "1") {
    const fwd =
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "";
    const real = req.headers.get("x-real-ip")?.trim() || "";
    if (isLoopbackIp(fwd) || isLoopbackIp(real)) return true;
  }
  return false;
}
