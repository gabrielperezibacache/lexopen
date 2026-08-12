/**
 * Block SSRF to localhost / private / link-local / metadata hosts.
 * Shared by Hermes and other outbound HTTP integrations.
 */

export function isCloudMetadataHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    host === "metadata.google.internal" ||
    host === "metadata" ||
    host === "169.254.169.254" ||
    host === "169.254.170.2"
  );
}

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0"
  );
}

export function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    isLoopbackHostname(host) ||
    isCloudMetadataHostname(host) ||
    host.endsWith(".local") ||
    host.endsWith(".internal")
  ) {
    return true;
  }
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet))) {
    return false;
  }
  return (
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

/** True when URL is http(s), has no credentials, and host is not private. */
export function isSafeOutboundHttpUrl(
  value: unknown,
  opts?: { allowHttp?: boolean; allowLoopback?: boolean }
): boolean {
  if (typeof value !== "string" || !value.trim()) return false;
  try {
    const url = new URL(value);
    const allowHttp = opts?.allowHttp ?? process.env.NODE_ENV !== "production";
    if (url.protocol === "https:") {
      // ok
    } else if (url.protocol === "http:" && allowHttp) {
      // ok in non-prod / explicit
    } else {
      return false;
    }
    if (url.username || url.password) return false;
    if (isCloudMetadataHostname(url.hostname)) return false;
    if (opts?.allowLoopback && isLoopbackHostname(url.hostname)) return true;
    if (isPrivateOrLocalHostname(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}

/**
 * Outbound fetch that never follows redirects (blocks redirect-based SSRF).
 * Re-validates the URL immediately before the request.
 */
export async function fetchSafeOutbound(
  url: string,
  init?: RequestInit & { allowHttp?: boolean; allowLoopback?: boolean }
): Promise<Response> {
  const { allowHttp, allowLoopback, ...rest } = init || {};
  if (!isSafeOutboundHttpUrl(url, { allowHttp, allowLoopback })) {
    throw new Error("URL de salida no permitida (SSRF)");
  }
  return fetch(url, {
    ...rest,
    redirect: "error",
  });
}
