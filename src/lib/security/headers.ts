/** Shared progressive security headers for next.config / proxy / docs. */

export function buildContentSecurityPolicy(opts?: {
  https?: boolean;
  nonce?: string;
  isDev?: boolean;
}) {
  const isDev = opts?.isDev ?? process.env.NODE_ENV === "development";
  const nonce = opts?.nonce?.trim();
  const scriptSrc = nonce
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${
        isDev ? " 'unsafe-eval'" : ""
      }`
    : // Fallback without per-request nonce (tests / static headers only).
      "script-src 'self' 'unsafe-inline' 'unsafe-eval'";

  // Production: nonce for <style> tags Next stamps; attributes stay inline for
  // React style={{…}}. Development keeps style-src unsafe-inline for HMR tooling.
  let styleSrc: string;
  if (nonce && !isDev) {
    styleSrc = `style-src 'self' 'nonce-${nonce}'`;
  } else if (nonce && isDev) {
    styleSrc = `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`;
  } else {
    styleSrc = "style-src 'self' 'unsafe-inline'";
  }

  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    styleSrc,
    "style-src-attr 'unsafe-inline'",
    scriptSrc,
    "script-src-attr 'none'",
    "connect-src 'self'",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
  ];
  if (opts?.https) {
    directives.push("upgrade-insecure-requests");
  }
  return directives.join("; ");
}

export function buildSecurityHeaders(opts?: {
  https?: boolean;
  nonce?: string;
  isDev?: boolean;
  /** When false, omit CSP (set per-request from proxy with a nonce). Default true. */
  includeCsp?: boolean;
}) {
  const https =
    opts?.https ?? Boolean(process.env.NEXT_PUBLIC_APP_URL?.startsWith("https://"));
  const headers = [
    { key: "X-Frame-Options", value: "DENY" },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  ];
  if (opts?.includeCsp !== false) {
    headers.push({
      key: "Content-Security-Policy",
      value: buildContentSecurityPolicy({
        https,
        nonce: opts?.nonce,
        isDev: opts?.isDev,
      }),
    });
  }
  if (https) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }
  return headers;
}
