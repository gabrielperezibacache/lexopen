/**
 * Block SSRF to localhost / private / link-local / metadata hosts.
 * Shared by Hermes and other outbound HTTP integrations.
 */

/** DNS-rebinding helper zones that can point at private addresses. */
const REBINDING_SUFFIXES = [
  ".nip.io",
  ".sslip.io",
  ".xip.io",
  ".localtest.me",
];

export function isCloudMetadataHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "metadata.google.internal" ||
    host === "metadata" ||
    host === "169.254.169.254" ||
    host === "169.254.170.2"
  ) {
    return true;
  }
  const mapped = ipv4FromMappedIpv6(host);
  return Boolean(
    mapped &&
      mapped[0] === 169 &&
      mapped[1] === 254 &&
      (mapped[2] === 169 || mapped[2] === 170)
  );
}

export function isLoopbackHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (
    host === "localhost" ||
    host === "127.0.0.1" ||
    host === "::1" ||
    host === "0.0.0.0"
  ) {
    return true;
  }
  const mapped = ipv4FromMappedIpv6(host);
  if (mapped && (mapped[0] === 127 || mapped.every((o) => o === 0))) {
    return true;
  }
  return false;
}

function parseIpv4(host: string): number[] | null {
  const parts = host.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    if (part.length > 1 && part.startsWith("0")) return null;
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) return null;
    octets.push(octet);
  }
  return octets;
}

function isPrivateIpv4(octets: number[]): boolean {
  return (
    octets[0] === 0 ||
    octets[0] === 10 ||
    octets[0] === 127 ||
    (octets[0] === 169 && octets[1] === 254) ||
    (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
    (octets[0] === 192 && octets[1] === 168)
  );
}

/** Extract IPv4 from ::ffff:a.b.c.d or ::ffff:xxxx:yyyy forms. */
function ipv4FromMappedIpv6(host: string): number[] | null {
  const dotted = host.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i);
  if (dotted) return parseIpv4(dotted[1]!);
  const hex = host.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (!hex) return null;
  const hi = Number.parseInt(hex[1]!, 16);
  const lo = Number.parseInt(hex[2]!, 16);
  if (!Number.isFinite(hi) || !Number.isFinite(lo)) return null;
  return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff];
}

function expandIpv6Hextets(host: string): number[] | null {
  if (!host.includes(":")) return null;
  if (host.includes(".")) {
    // Mapped form handled elsewhere; reject mixed for hextet expand.
    return null;
  }
  const halves = host.split("::");
  if (halves.length > 2) return null;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if (halves.length === 1) {
    if (left.length !== 8) return null;
  } else if (left.length + right.length > 8) {
    return null;
  }
  const missing = 8 - left.length - right.length;
  const parts = [
    ...left,
    ...(halves.length === 2 ? Array(missing).fill("0") : []),
    ...right,
  ];
  if (parts.length !== 8) return null;
  const hextets: number[] = [];
  for (const part of parts) {
    if (!/^[0-9a-f]{1,4}$/i.test(part)) return null;
    hextets.push(Number.parseInt(part, 16));
  }
  return hextets;
}

function isPrivateIpv6Literal(host: string): boolean {
  const mapped = ipv4FromMappedIpv6(host);
  if (mapped) return isPrivateIpv4(mapped);

  if (host === "::" || host === "::1") return true;

  const hextets = expandIpv6Hextets(host);
  if (!hextets) {
    // Unparseable IPv6-looking host: fail closed.
    return host.includes(":");
  }

  // Loopback ::1
  if (hextets.every((h, i) => (i === 7 ? h === 1 : h === 0))) return true;
  // Unspecified ::
  if (hextets.every((h) => h === 0)) return true;
  // Link-local fe80::/10
  if ((hextets[0]! & 0xffc0) === 0xfe80) return true;
  // Unique local fc00::/7
  if ((hextets[0]! & 0xfe00) === 0xfc00) return true;
  // IPv4-mapped in expanded form 0:0:0:0:0:ffff:x:y
  if (
    hextets[0] === 0 &&
    hextets[1] === 0 &&
    hextets[2] === 0 &&
    hextets[3] === 0 &&
    hextets[4] === 0 &&
    hextets[5] === 0xffff
  ) {
    const octets = [
      (hextets[6]! >> 8) & 0xff,
      hextets[6]! & 0xff,
      (hextets[7]! >> 8) & 0xff,
      hextets[7]! & 0xff,
    ];
    return isPrivateIpv4(octets);
  }
  return false;
}

function hostnameEmbedsPrivateIpv4(host: string): boolean {
  // e.g. 10.0.0.1.nip.io already caught by suffix; also 127.0.0.1.example.com
  const matches = host.matchAll(/(?:^|\.)((?:\d{1,3}\.){3}\d{1,3})(?=\.|$)/g);
  for (const match of matches) {
    const octets = parseIpv4(match[1]!);
    if (octets && isPrivateIpv4(octets)) return true;
  }
  return false;
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
  if (REBINDING_SUFFIXES.some((suffix) => host.endsWith(suffix))) {
    return true;
  }
  if (hostnameEmbedsPrivateIpv4(host)) {
    return true;
  }
  const v4 = parseIpv4(host);
  if (v4) return isPrivateIpv4(v4);
  if (host.includes(":")) return isPrivateIpv6Literal(host);
  return false;
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
