import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  ROLE_COOKIE,
  SESSION_COOKIE,
  buildSessionCookieValue,
  requireRole,
} from "@/lib/auth/session";
import { canImpersonate } from "@/lib/auth/rbac";
import { assertCsrf, handleRouteError } from "@/lib/api";

const schema = z.object({
  userId: z.string().min(1).optional(),
  email: z.string().email().optional(),
});

/** Dev/demo-only role switch without reusing shared passwords in the client. */
export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    await requireRole("admin");
    if (!canImpersonate()) {
      return NextResponse.json({ error: "Impersonación deshabilitada" }, { status: 403 });
    }
    const body = schema.parse(await req.json());
    const target = body.userId
      ? await prisma.user.findUnique({ where: { id: body.userId } })
      : body.email
        ? await prisma.user.findUnique({
            where: { email: body.email.trim().toLowerCase() },
          })
        : null;
    if (!target) {
      return NextResponse.json({ error: "Usuario no encontrado" }, { status: 404 });
    }

    const session = buildSessionCookieValue(target.id);
    const res = NextResponse.json({
      ok: true,
      user: {
        id: target.id,
        name: target.name,
        email: target.email,
        role: target.role,
      },
    });
    const cookieBase = {
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: session.maxAge,
    };
    res.cookies.set(SESSION_COOKIE, session.value, { ...cookieBase, httpOnly: true });
    res.cookies.set(ROLE_COOKIE, target.role, { ...cookieBase, httpOnly: false });
    return res;
  } catch (e) {
    return handleRouteError(e);
  }
}
