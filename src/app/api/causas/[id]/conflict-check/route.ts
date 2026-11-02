import {
  assertCsrf,
  handleRouteError,
  requireStaff,
} from "@/lib/api";
import { writeAuditStrict } from "@/lib/audit";
import { assertCausaCapability as mutateCausa, causaAccessWhere as scopedcausaAccessWhere } from "@/lib/auth/causa-access";
import {
  checkConflicts
} from "@/lib/conflict";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

/** Re-ejecuta conflict check sobre las partes actuales de la causa. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    await mutateCausa(id, user, "causa.write");
    const causa = await prisma.causa.findFirst({
      where: { AND: [scopedcausaAccessWhere(user), { id }] },
      include: { partes: true },
    });
    if (!causa) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }

    const risk = await checkConflicts({
      user,
      partes: causa.partes.map((p) => ({ nombre: p.nombre, rut: p.rut })),
      excludeCausaId: id,
    });
    const conflicts = risk.conflicts;
    const conflictStatus = risk.status;

    return await prisma.$transaction(async (tx) => {
      await tx.causa.update({
        where: { id },
        data: {
          conflictCheckedAt: new Date(),
          conflictStatus,
        },
      });

      await writeAuditStrict({
        actorId: user.id,
        action: "causa.conflict_recheck",
        entityType: "Causa",
        entityId: id,
        after: { conflictStatus, hits: conflicts.length },
      }, tx);

      return NextResponse.json({ ...risk, conflictStatus });
    }, { isolationLevel: "Serializable" });
  } catch (e) {
    return handleRouteError(e);
  }
}
