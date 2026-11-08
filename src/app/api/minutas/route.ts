import { assertCsrf, handleRouteError, minutaConfidentialWhere, requireStaff } from "@/lib/api";
import { requiredCausaWhere as scopedrequiredCausaWhere, documentReadWhere } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { currentStaffActor } from "@/lib/auth/staff-actor";
import { serializable, requestCommandKey } from "@/lib/command-execution";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { nativeMinuteCreateSchema, createNativeMinute } from "@/lib/minutas/http-service";
import { isRealDriveFolderId } from "@/lib/integrations/drive-folder";
import { pushMinutaToDrive } from "@/lib/integrations/google";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
  const user = await requireStaff();
  const causaId = req.nextUrl.searchParams.get("causaId");
  const rawLimit = Number(req.nextUrl.searchParams.get("limit") || 50);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
    : 50;

  const minutas = await prisma.minuta.findMany({
    where: { AND: [scopedrequiredCausaWhere(user), {
      ...(causaId ? { causaId } : {}),
      ...minutaConfidentialWhere(user),
    }] },
    include: {
      causa: { select: { id: true, titulo: true, rit: true, tribunal: true } },
      autor: { select: { id: true, name: true, email: true } },
      acciones: { orderBy: { fechaLimite: "asc" } },
      documento: { select: { id: true, nombre: true, googleDriveId: true } },
    },
    orderBy: { fecha: "desc" },
    take: limit,
  });

  const ids = minutas.flatMap(m => m.documento ? [m.documento.id] : []);
  const readable = new Set((await prisma.documento.findMany({ where: { id: { in: ids }, ...documentReadWhere(user) }, select: { id: true } })).map(d => d.id));
  return NextResponse.json(minutas.map(m => ({ ...m, documento: m.documento && readable.has(m.documento.id) ? m.documento : null })), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req); const user = await requireStaff();
    const body = await parseKnowledgeBody(req, nativeMinuteCreateSchema);
    const minuta = await createNativeMinute(user, body, requestCommandKey(req, "minuta.create"));
    let drive: Record<string, unknown> | null = null;
    if (body.subirADrive) {
      if (!isRealDriveFolderId(minuta.causa.googleDriveFolderId)) drive = { status: "needs_real_folder", message: "Minuta guardada. Vincule una carpeta real para subirla a Drive." };
      else {
        const actor = await serializable(tx => currentStaffActor(user, tx));
        try { drive = await pushMinutaToDrive(minuta.id, { role: actor.role }); }
        catch (e) { drive = { status: "error", message: e instanceof Error ? e.message : "Error al subir a Drive" }; }
      }
    }
    return NextResponse.json({ minuta, acciones: minuta.acciones, drive, warnings: drive && drive.status !== "uploaded" ? [drive.message || drive.status] : [] }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleRouteError(error); }
}
