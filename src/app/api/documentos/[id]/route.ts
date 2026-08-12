import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { documentoUpdateSchema } from "@/lib/schemas";
import { writeAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const existing = await prisma.documento.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    const body = await parseBody(req, documentoUpdateSchema);
    const documento = await prisma.documento.update({
      where: { id },
      data: {
        ...(body.nombre !== undefined ? { nombre: body.nombre.trim() } : {}),
        ...(body.tipo !== undefined ? { tipo: body.tipo } : {}),
        ...(body.confidencial !== undefined
          ? { confidencial: body.confidencial }
          : {}),
        ...(body.privilegio !== undefined
          ? { privilegio: body.privilegio }
          : {}),
      },
    });
    await writeAudit({
      actorId: user.id,
      action: "documento.update",
      entityType: "Documento",
      entityId: id,
      before: existing,
      after: documento,
    });
    return NextResponse.json(documento);
  } catch (e) {
    return handleRouteError(e);
  }
}
