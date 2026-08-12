/**
 * Restrict post-login redirects to same-origin relative paths.
 * Blocks protocol-relative URLs like `//evil.com`.
 */
export function safeAppPath(next: string | null | undefined, fallback = "/dashboard") {
  if (!next) return fallback;
  if (!next.startsWith("/")) return fallback;
  if (next.startsWith("//")) return fallback;
  if (next.includes("\\") || next.includes("\0")) return fallback;
  return next;
}
