import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  requireStaff,
} from "@/lib/api";
import {
  checkConflicts,
  summarizeConflictStatus,
} from "@/lib/conflict";
import { writeAuditStrict } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

/** Re-ejecuta conflict check sobre las partes actuales de la causa. */
export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const causa = await prisma.causa.findUnique({
      where: { id },
      include: { partes: true },
    });
    if (!causa) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }

    const conflicts = await checkConflicts({
      partes: causa.partes.map((p) => ({ nombre: p.nombre, rut: p.rut })),
      excludeCausaId: id,
    });
    const conflictStatus = summarizeConflictStatus(conflicts);

    await prisma.causa.update({
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
    });

    return NextResponse.json({ conflicts, conflictStatus });
  } catch (e) {
    return handleRouteError(e);
  }
}
