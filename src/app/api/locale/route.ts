import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, parseBody } from "@/lib/api";
import { LOCALE_COOKIE, isLocale, negotiateLocale } from "@/lib/i18n";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const fromCookie = req.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(fromCookie)
    ? fromCookie
    : negotiateLocale(req.headers.get("accept-language"));
  return NextResponse.json({ locale });
}

export async function POST(req: NextRequest) {
  try {
    const body = await parseBody(
      req,
      z.object({ locale: z.enum(["es", "en"]) })
    );
    const res = NextResponse.json({ ok: true, locale: body.locale });
    res.cookies.set(LOCALE_COOKIE, body.locale, {
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
      sameSite: "lax",
      httpOnly: false,
    });
    return res;
  } catch (e) {
    return handleRouteError(e);
  }
}
