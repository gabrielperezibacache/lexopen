import { NextRequest, NextResponse } from "next/server";
import {
  ROLE_COOKIE,
  SESSION_COOKIE,
  verifySessionToken,
} from "@/lib/auth/session";
import { assertCsrf } from "@/lib/api";
import { baseCookieOptions } from "@/lib/auth/cookie-options";
import { clearCsrfCookie } from "@/lib/auth/csrf-token";
import { prisma } from "@/lib/db";

export async function POST(req: NextRequest) {
  assertCsrf(req);
  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  if (raw) {
    const parsed = verifySessionToken(raw);
    if (parsed?.userId) {
      try {
        await prisma.user.update({
          where: { id: parsed.userId },
          data: { sessionVersion: { increment: 1 } },
        });
      } catch {
        // User may already be gone; still clear cookies.
      }
    }
  }
  const res = NextResponse.json({ ok: true });
  const clear = baseCookieOptions({ maxAge: 0 });
  res.cookies.set(SESSION_COOKIE, "", clear);
  res.cookies.set(ROLE_COOKIE, "", { ...clear, httpOnly: false });
  clearCsrfCookie(res);
  return res;
}
