import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  ROLE_COOKIE,
  SESSION_COOKIE,
  buildSessionCookieValue,
} from "@/lib/auth/session";
import { hashPassword, looksHashed, verifyPassword } from "@/lib/auth/password";
import { canImpersonate } from "@/lib/auth/rbac";
import { rateLimit } from "@/lib/auth/rate-limit";
import { assertCsrf, handleRouteError } from "@/lib/api";
import { baseCookieOptions } from "@/lib/auth/cookie-options";
import { appendCsrfCookie } from "@/lib/auth/csrf-token";

const schema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const body = schema.parse(await req.json());
    const email = body.email.trim().toLowerCase();

    // Only trust forwarded IPs behind an explicit reverse proxy.
    // Without a trusted proxy, still apply a coarse shared bucket to slow sprays.
    const ip =
      process.env.LEXOPEN_TRUSTED_PROXY === "1"
        ? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
          req.headers.get("x-real-ip") ||
          "unknown"
        : "direct";
    const limited = rateLimit(`login:${ip}`, 40, 15 * 60 * 1000);
    if (!limited.ok) {
      return NextResponse.json(
        { error: "Demasiados intentos. Espere e intente de nuevo." },
        {
          status: 429,
          headers: {
            "Retry-After": String(
              Math.ceil((limited.retryAfterMs || 60000) / 1000)
            ),
          },
        }
      );
    }

    const emailLimited = rateLimit(`login-email:${email}`, 10, 15 * 60 * 1000);
    if (!emailLimited.ok) {
      return NextResponse.json(
        { error: "Demasiados intentos para este usuario." },
        { status: 429 }
      );
    }

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    const ok = await verifyPassword(body.password, user.password);
    if (!ok) {
      return NextResponse.json({ error: "Credenciales inválidas" }, { status: 401 });
    }

    // Upgrade plaintext → hash on successful login (non-prod / migrate path)
    if (!looksHashed(user.password)) {
      await prisma.user.update({
        where: { id: user.id },
        data: { password: await hashPassword(body.password) },
      });
    }

    const session = buildSessionCookieValue(
      user.id,
      user.sessionVersion,
      user.role
    );
    const res = NextResponse.json({
      ok: true,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role,
      },
      demoSwitcher: canImpersonate(),
    });
    const cookieBase = baseCookieOptions({ maxAge: session.maxAge });
    res.cookies.set(SESSION_COOKIE, session.value, cookieBase);
    // UX hint only — authorization uses the signed session token role.
    res.cookies.set(ROLE_COOKIE, user.role, {
      ...cookieBase,
      httpOnly: false,
    });
    appendCsrfCookie(res);
    return res;
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Email y contraseña requeridos" }, { status: 400 });
    }
    return handleRouteError(e);
  }
}
