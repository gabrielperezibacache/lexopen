import { timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { baseCookieOptions } from "@/lib/auth/cookie-options";

export const GMAIL_OAUTH_COOKIE = "lexopen_mail_google_oauth";
export const GMAIL_OAUTH_PATH = "/api/mail/google/callback";
export const MICROSOFT_OAUTH_COOKIE = "lexopen_mail_microsoft_oauth";
export const MICROSOFT_OAUTH_PATH = "/api/mail/microsoft/callback";

export function oauthStateMatches(provided: string, expected: string) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function bindOauthState(userId: string, nonce: string) {
  return `${userId}.${nonce}`;
}

export function oauthStateUserId(state: string) {
  const dot = state.indexOf(".");
  if (dot < 1) return null;
  return state.slice(0, dot);
}

export function setOauthStateCookie(
  res: NextResponse,
  cookie: string,
  path: string,
  value: string
) {
  res.cookies.set(cookie, value, {
    ...baseCookieOptions({ maxAge: 10 * 60 }),
    path,
  });
  return res;
}

export function clearOauthStateCookie(
  res: NextResponse,
  cookie: string,
  path: string
) {
  res.cookies.set(cookie, "", {
    ...baseCookieOptions({ maxAge: 0 }),
    path,
  });
  return res;
}
