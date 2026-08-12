/**
 * Restrict post-login redirects to same-origin relative paths.
 * Blocks protocol-relative URLs, backslashes, control chars, and odd schemes.
 */
export function safeAppPath(next: string | null | undefined, fallback = "/dashboard") {
  if (!next) return fallback;
  let value = String(next).trim();
  if (!value.startsWith("/")) return fallback;
  if (value.startsWith("//")) return fallback;
  // Decode once; reject if decoding fails or introduces new separators.
  try {
    const decoded = decodeURIComponent(value);
    if (decoded !== value) {
      if (
        decoded.startsWith("//") ||
        decoded.includes("\\") ||
        /[\u0000-\u001f\u007f]/.test(decoded)
      ) {
        return fallback;
      }
      value = decoded;
    }
  } catch {
    return fallback;
  }
  if (value.includes("\\") || value.includes("\0")) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(value)) return fallback;
  const pathOnly = value.split(/[?#]/, 1)[0] || value;
  // Reject protocol-relative tricks inside the path (`///evil`, `/\\host`).
  if (pathOnly.includes("//") || pathOnly.includes("/\\")) return fallback;
  // Path (+ optional query/hash). No scheme.
  if (
    !/^\/[A-Za-z0-9._~!$&'()*+,;=:@/%-]*(?:\?[A-Za-z0-9._~!$&'()*+,;=:@/?%-]*)?(?:#[A-Za-z0-9._~!$&'()*+,;=:@/?%-]*)?$/.test(
      value
    )
  ) {
    return fallback;
  }
  return value;
}
