/**
 * Block SSRF to localhost / private / link-local / metadata hosts.
 * Shared by Hermes and other outbound HTTP integrations.
 */

export function isPrivateOrLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "metadata.google.internal" ||
    host === "metadata" ||
    host.endsWith(".local") ||
    host.endsWith(".internal") ||
    host === "::1" ||
    host === "0.0.0.0"
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
  opts?: { allowHttp?: boolean }
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
    if (isPrivateOrLocalHostname(url.hostname)) return false;
    return true;
  } catch {
    return false;
  }
}
