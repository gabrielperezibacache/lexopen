"use client";

import { useEffect } from "react";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/csrf-constants";

function readCsrfCookie() {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${CSRF_COOKIE}=`));
  if (!match) return null;
  return decodeURIComponent(match.slice(CSRF_COOKIE.length + 1));
}

function shouldAttachCsrf(input: RequestInfo | URL, init?: RequestInit) {
  const method = (init?.method || "GET").toUpperCase();
  if (method === "GET" || method === "HEAD" || method === "OPTIONS") return false;
  const url =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? input.href
        : input.url;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.origin === window.location.origin;
  } catch {
    return false;
  }
}

/**
 * Ensures same-origin mutating fetch() calls send the double-submit CSRF header.
 * Legacy safety net: prefer explicit `apiMutation` for new mutating calls so errors
 * surface consistently. Remove this patch only after auditing all POST/PATCH/DELETE.
 */
export function CsrfFetchPatch() {
  useEffect(() => {
    const original = window.fetch.bind(window);
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (!shouldAttachCsrf(input, init)) {
        return original(input, init);
      }
      const token = readCsrfCookie();
      if (!token) return original(input, init);
      const headers = new Headers(init?.headers || undefined);
      if (!headers.has(CSRF_HEADER)) headers.set(CSRF_HEADER, token);
      return original(input, { ...init, headers });
    };
    return () => {
      window.fetch = original;
    };
  }, []);

  return null;
}
