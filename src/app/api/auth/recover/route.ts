import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError } from "@/lib/api";
import { hashPassword } from "@/lib/auth/password";
import { isValidBootstrapToken } from "@/lib/auth/bootstrap";
import { writeAudit } from "@/lib/audit";

const recoverySchema = z.object({
  token: z.string().min(1).max(256),
  email: z.string().trim().email().max(320),
  newPassword: z.string().min(12).max(256),
});

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const body = recoverySchema.parse(await req.json());
    if (
      !isValidBootstrapToken(
        body.token,
        process.env.LEXOPEN_RECOVERY_TOKEN
      )
    ) {
      return NextResponse.json({ error: "Token de recuperación inválido" }, { status: 403 });
    }

    const admin = await prisma.user.findFirst({
      where: { email: body.email.toLowerCase(), role: "admin" },
      select: { id: true },
    });
    // Constant response avoids admin email enumeration.
    if (admin) {
      await prisma.user.update({
        where: { id: admin.id },
        data: {
          password: await hashPassword(body.newPassword),
          sessionVersion: { increment: 1 },
        },
      });
      await writeAudit({
        actorId: null,
        action: "user.password_recovery",
        entityType: "User",
        entityId: admin.id,
        after: { source: "local recovery token" },
      });
    }
    return NextResponse.json({
      ok: true,
      message:
        "Si el administrador existe, la contraseña fue actualizada. Inicie sesión con la nueva clave.",
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
