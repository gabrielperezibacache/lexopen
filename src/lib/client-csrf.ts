import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/csrf-constants";

/** Browser helper: attach double-submit CSRF header from cookie. */
export function withCsrfHeaders(init?: HeadersInit): Headers {
  const headers = new Headers(init || undefined);
  if (typeof document === "undefined") return headers;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CSRF_COOKIE}=`));
  if (!match) return headers;
  const token = decodeURIComponent(match.slice(CSRF_COOKIE.length + 1));
  if (token && !headers.has(CSRF_HEADER)) headers.set(CSRF_HEADER, token);
  return headers;
}
