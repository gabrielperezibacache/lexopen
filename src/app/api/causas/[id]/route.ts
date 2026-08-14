import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  confidentialWhere,
  handleRouteError,
  minutaConfidentialWhere,
  parseBody,
  requireRole,
  requireStaff,
} from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { publicUserSelect } from "@/lib/auth/public-user";
import { isStaff } from "@/lib/auth/rbac";
import { documentoListSelect } from "@/lib/sites/file-select";
import { causaUpdateSchema } from "@/lib/schemas";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    const causa = await prisma.causa.findUnique({
      where: { id },
      include: {
        cliente: true,
        abogado: { select: publicUserSelect },
        partes: true,
        documentos: {
          where: confidentialWhere(user.role),
          orderBy: { updatedAt: "desc" },
          select: documentoListSelect,
        },
        plazos: { orderBy: { fechaLimite: "asc" } },
        notas: { orderBy: { updatedAt: "desc" } },
        minutas: {
          where: minutaConfidentialWhere(user.role),
          include: {
            autor: { select: publicUserSelect },
            acciones: true,
          },
          orderBy: { fecha: "desc" },
          take: 20,
        },
        actividades: {
          include: { user: { select: publicUserSelect } },
          orderBy: { createdAt: "desc" },
          take: 30,
        },
      },
    });
    if (!causa) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }
    return NextResponse.json(causa);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const body = await parseBody(req, causaUpdateSchema);

    const data: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(body)) {
      if (value !== undefined) data[key] = value;
    }

    if (typeof data.abogadoId === "string") {
      const assigned = await prisma.user.findUnique({
        where: { id: data.abogadoId },
        select: { id: true, role: true },
      });
      if (!assigned || !isStaff(assigned.role)) {
        return NextResponse.json(
          { error: "El responsable debe ser un usuario del estudio" },
          { status: 400 }
        );
      }
    }

    if (data.clienteId === "") data.clienteId = null;
    if (data.abogadoId === "") data.abogadoId = null;

    const prev = await prisma.causa.findUnique({ where: { id } });
    if (!prev) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }
    const causa = await prisma.causa.update({
      where: { id },
      data,
    });

    if (body.estado || body.etapa) {
      await prisma.activity.create({
        data: {
          tipo: "estado",
          mensaje: `Actualización: estado=${causa.estado}, etapa=${causa.etapa}`,
          causaId: causa.id,
          userId: user.id,
        },
      });
    }
    if (body.etapa && body.etapa !== prev.etapa) {
      await prisma.etapaHistorial.create({
        data: { causaId: id, etapa: body.etapa, nota: "Cambio de etapa" },
      });
    }
    await writeAudit({
      actorId: user.id,
      action: "causa.update",
      entityType: "Causa",
      entityId: id,
      before: prev,
      after: data,
    });

    return NextResponse.json(causa);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  try {
    assertCsrf(_req);
    const user = await requireRole("admin");
    const { id } = await params;
    const prev = await prisma.causa.findUnique({
      where: { id },
      select: { id: true, titulo: true, rit: true },
    });
    if (!prev) {
      return NextResponse.json({ error: "No encontrada" }, { status: 404 });
    }
    await prisma.causa.delete({ where: { id } });
    await writeAudit({
      actorId: user.id,
      action: "causa.delete",
      entityType: "Causa",
      entityId: id,
      before: prev,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
