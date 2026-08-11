import { NextRequest, NextResponse } from "next/server";
import { ROLE_COOKIE, SESSION_COOKIE } from "@/lib/auth/session";
import { assertCsrf } from "@/lib/api";

export async function POST(req: NextRequest) {
  assertCsrf(req);
  const res = NextResponse.json({ ok: true });
  const clear = {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  };
  res.cookies.set(SESSION_COOKIE, "", clear);
  res.cookies.set(ROLE_COOKIE, "", { ...clear, httpOnly: false });
  return res;
}
