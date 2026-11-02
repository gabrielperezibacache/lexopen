import {
  assertCsrf,
  canReadFlagged,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { writeAuditStrict } from "@/lib/audit";
import { assertCausaCapability, documentReadWhere as scopeddocumentReadWhere } from "@/lib/auth/causa-access";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { documentoUpdateSchema } from "@/lib/schemas";
import { documentoListSelect } from "@/lib/sites/file-select";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const existing = await prisma.documento.findFirst({ where: { AND: [scopeddocumentReadWhere(user), { id }] } });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    if (
      !canReadFlagged(user, existing)
    ) {
      return NextResponse.json(
        { error: "Documento confidencial" },
        { status: 403 }
      );
    }
    if (existing.causaId) await assertCausaCapability(existing.causaId, user, "causa.write");
    const body = await parseBody(req, documentoUpdateSchema);
    if (
      (body.confidencial === true || body.privilegio === true) &&
      !canSeeConfidential(user)
    ) {
      return NextResponse.json(
        {
          error:
            "Su rol no puede marcar documentos como confidenciales o privilegiados",
        },
        { status: 403 }
      );
    }
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
      select: documentoListSelect,
    });
    await writeAuditStrict({
      actorId: user.id,
      action: "documento.update",
      entityType: "Documento",
      entityId: id,
      before: {
        nombre: existing.nombre,
        tipo: existing.tipo,
        confidencial: existing.confidencial,
        privilegio: existing.privilegio,
      },
      after: {
        nombre: documento.nombre,
        tipo: documento.tipo,
        confidencial: documento.confidencial,
        privilegio: documento.privilegio,
      },
    });
    return NextResponse.json(documento);
  } catch (e) {
    return handleRouteError(e);
  }
}
