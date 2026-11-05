import { assertPjudManagementEnabled } from "@/lib/causas/management-mode";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { writeAuditStrict } from "@/lib/audit";
import { assertCausaCapability as mutateCausa, assertCausaAccess as readCausa, causaAccessWhere as scopedcausaAccessWhere } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import {
  getCausaDocImportStatus,
  startCausaDocImport,
} from "@/lib/pjud/import-causa-documents";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireStaff();
    await assertPjudManagementEnabled();
    const { id } = await params;
    await readCausa(id, user);
    const causa = await prisma.causa.findFirst({
      where: { AND: [scopedcausaAccessWhere(user), { id }] },
      select: { id: true },
    });
    if (!causa) {
      return NextResponse.json({ error: "Causa no encontrada" }, { status: 404 });
    }
    return NextResponse.json({ status: getCausaDocImportStatus(id) });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    await assertPjudManagementEnabled();
    const { id } = await params;
    await mutateCausa(id, user, "causa.write");
    const causa = await prisma.causa.findFirst({
      where: { AND: [scopedcausaAccessWhere(user), { id }] },
      select: { id: true, rit: true },
    });
    if (!causa) {
      return NextResponse.json({ error: "Causa no encontrada" }, { status: 404 });
    }

    const result = startCausaDocImport(id);
    if (result.globalBusy) {
      return NextResponse.json(
        {
          error:
            result.status.note ||
            "Ya hay una descarga de documentos en curso. Espere a que termine.",
          status: result.status,
        },
        { status: 409 }
      );
    }

    await writeAuditStrict({
      actorId: user.id,
      action: result.started
        ? "pjud.docs.import.start"
        : "pjud.docs.import.poll",
      entityType: "Causa",
      entityId: id,
      after: {
        started: result.started,
        alreadyRunning: result.alreadyRunning,
        rit: causa.rit,
      },
    });

    return NextResponse.json(
      {
        ok: true,
        started: result.started,
        alreadyRunning: result.alreadyRunning,
        status: result.status,
      },
      { status: result.started ? 202 : 200 }
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
