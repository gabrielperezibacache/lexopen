import { NextRequest, NextResponse } from "next/server";
import { ROLE_COOKIE, SESSION_COOKIE } from "@/lib/auth/session";
import { assertCsrf } from "@/lib/api";
import { baseCookieOptions } from "@/lib/auth/cookie-options";
import { clearCsrfCookie } from "@/lib/auth/csrf-token";

export async function POST(req: NextRequest) {
  assertCsrf(req);
  const res = NextResponse.json({ ok: true });
  const clear = baseCookieOptions({ maxAge: 0 });
  res.cookies.set(SESSION_COOKIE, "", clear);
  res.cookies.set(ROLE_COOKIE, "", { ...clear, httpOnly: false });
  clearCsrfCookie(res);
  return res;
}
