import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, parseBody, requireUser } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { passwordChangeSchema } from "@/lib/schemas";
import { writeAudit } from "@/lib/audit";
import {
  ROLE_COOKIE,
  SESSION_COOKIE,
  buildSessionCookieValue,
} from "@/lib/auth/session";

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireUser();
    const body = await parseBody(req, passwordChangeSchema);
    if (body.currentPassword === body.newPassword) {
      return NextResponse.json(
        { error: "La nueva contraseña debe ser distinta" },
        { status: 400 }
      );
    }
    if (!(await verifyPassword(body.currentPassword, user.password))) {
      return NextResponse.json({ error: "Contraseña actual inválida" }, { status: 401 });
    }

    const nextSessionVersion = user.sessionVersion + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password: await hashPassword(body.newPassword),
        sessionVersion: nextSessionVersion,
      },
    });
    await writeAudit({
      actorId: user.id,
      action: "user.password_change",
      entityType: "User",
      entityId: user.id,
    });
    const session = buildSessionCookieValue(user.id, nextSessionVersion);
    const response = NextResponse.json({ ok: true });
    const cookieBase = {
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: session.maxAge,
    };
    response.cookies.set(SESSION_COOKIE, session.value, {
      ...cookieBase,
      httpOnly: true,
    });
    response.cookies.set(ROLE_COOKIE, user.role, {
      ...cookieBase,
      httpOnly: false,
    });
    return response;
  } catch (e) {
    return handleRouteError(e);
  }
}
