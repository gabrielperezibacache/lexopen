import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, parseBody, requireUser } from "@/lib/api";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { passwordChangeSchema } from "@/lib/schemas";
import { writeAudit } from "@/lib/audit";

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

    await prisma.user.update({
      where: { id: user.id },
      data: { password: await hashPassword(body.newPassword) },
    });
    await writeAudit({
      actorId: user.id,
      action: "user.password_change",
      entityType: "User",
      entityId: user.id,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
