import { timingSafeEqual } from "crypto";
import type { NextResponse } from "next/server";
import { newCsrfToken } from "@/lib/auth/session";
import { baseCookieOptions } from "@/lib/auth/cookie-options";
import { httpError } from "@/lib/auth/access";
import { CSRF_COOKIE, CSRF_HEADER } from "@/lib/auth/csrf-constants";

export { CSRF_COOKIE, CSRF_HEADER };

function timingSafeEqualString(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    timingSafeEqual(left, left);
    return false;
  }
  return timingSafeEqual(left, right);
}

export function readCookie(req: Request, name: string) {
  const header = req.headers.get("cookie");
  if (!header) return null;
  for (const part of header.split(";")) {
    const [rawKey, ...rest] = part.trim().split("=");
    if (rawKey === name) return decodeURIComponent(rest.join("="));
  }
  return null;
}

export function appendCsrfCookie(res: NextResponse, token = newCsrfToken()) {
  res.cookies.set(CSRF_COOKIE, token, {
    ...baseCookieOptions({ httpOnly: false, maxAge: 14 * 24 * 60 * 60 }),
  });
  return token;
}

export function clearCsrfCookie(res: NextResponse) {
  res.cookies.set(CSRF_COOKIE, "", {
    ...baseCookieOptions({ httpOnly: false, maxAge: 0 }),
  });
}

/**
 * Double-submit CSRF: cookie (readable by JS) must match x-csrf-token header.
 * Enforced in production when a session cookie is present.
 */
export function assertCsrfDoubleSubmit(
  req: Request,
  opts?: { require?: boolean }
) {
  const cookie = readCookie(req, CSRF_COOKIE);
  const header = req.headers.get(CSRF_HEADER);
  const requireMatch =
    opts?.require ??
    (process.env.NODE_ENV === "production" &&
      Boolean(readCookie(req, "lexopen_session")));

  if (!requireMatch) {
    if (cookie && header && !timingSafeEqualString(cookie, header)) {
      throw httpError("CSRF: token inválido", 403);
    }
    return;
  }

  if (!cookie || !header) {
    throw httpError("CSRF: token requerido", 403);
  }
  if (!timingSafeEqualString(cookie, header)) {
    throw httpError("CSRF: token inválido", 403);
  }
}
