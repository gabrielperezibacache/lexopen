import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { writeAuditStrict } from "@/lib/audit";
import { prisma } from "@/lib/db";
import {
  getCausaDocImportStatus,
  startCausaDocImport,
} from "@/lib/pjud/import-causa-documents";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireStaff();
    const { id } = await params;
    const causa = await prisma.causa.findUnique({
      where: { id },
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
    const { id } = await params;
    const causa = await prisma.causa.findUnique({
      where: { id },
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
