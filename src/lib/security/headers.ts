/** Shared progressive security headers for next.config / docs. */

export function buildContentSecurityPolicy(opts?: { https?: boolean }) {
  const directives = [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    // Next.js App Router still needs inline/eval until nonce wiring lands.
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
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

export function buildSecurityHeaders(opts?: { https?: boolean }) {
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
    { key: "Content-Security-Policy", value: buildContentSecurityPolicy({ https }) },
  ];
  if (https) {
    headers.push({
      key: "Strict-Transport-Security",
      value: "max-age=31536000; includeSubDomains",
    });
  }
  return headers;
}
