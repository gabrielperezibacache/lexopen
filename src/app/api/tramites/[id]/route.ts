import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { tramiteUpdateSchema } from "@/lib/schemas";
import { writeAuditStrict } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const existing = await prisma.tramite.findUnique({
      where: { id },
      include: {
        causa: {
          select: { id: true, titulo: true, rit: true, clienteId: true },
        },
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    const body = await parseBody(req, tramiteUpdateSchema);

    let fechaHecho = existing.fechaHecho;
    if (body.fechaHecho !== undefined) {
      fechaHecho = body.fechaHecho ? new Date(body.fechaHecho) : null;
    } else if (body.estado === "hecho" && !existing.fechaHecho) {
      fechaHecho = new Date();
    } else if (
      body.estado &&
      body.estado !== "hecho" &&
      existing.estado === "hecho"
    ) {
      fechaHecho = null;
    }

    const tramite = await prisma.tramite.update({
      where: { id },
      data: {
        ...(body.titulo !== undefined ? { titulo: body.titulo.trim() } : {}),
        ...(body.detalle !== undefined ? { detalle: body.detalle || null } : {}),
        ...(body.estado !== undefined ? { estado: body.estado } : {}),
        ...(body.fechaLimite !== undefined
          ? { fechaLimite: body.fechaLimite ? new Date(body.fechaLimite) : null }
          : {}),
        fechaHecho,
        ...(body.responsableId !== undefined
          ? { responsableId: body.responsableId || null }
          : {}),
        ...(body.orden !== undefined ? { orden: body.orden } : {}),
      },
      include: {
        responsable: { select: { id: true, name: true } },
      },
    });

    const newResponsableId =
      body.responsableId !== undefined
        ? body.responsableId || null
        : existing.responsableId;
    if (
      body.responsableId !== undefined &&
      newResponsableId &&
      newResponsableId !== existing.responsableId &&
      newResponsableId !== user.id
    ) {
      const href = existing.causa.clienteId
        ? `/clientes/${existing.causa.clienteId}`
        : `/causas/${existing.causaId}#tramites`;
      await prisma.notification.create({
        data: {
          userId: newResponsableId,
          title: `Trámite asignado · ${existing.causa.rit || existing.causa.titulo}`,
          body: tramite.titulo,
          href,
        },
      });
    }

    if (body.estado && body.estado !== existing.estado) {
      await prisma.activity.create({
        data: {
          tipo: "tramite",
          mensaje: `Trámite «${tramite.titulo}» → ${tramite.estado}`,
          causaId: tramite.causaId,
          userId: user.id,
        },
      });
    }

    await writeAuditStrict({
      actorId: user.id,
      action: "tramite.update",
      entityType: "Tramite",
      entityId: id,
      before: existing,
      after: tramite,
    });

    return NextResponse.json(tramite);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const existing = await prisma.tramite.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "No encontrado" }, { status: 404 });
    }
    await prisma.tramite.delete({ where: { id } });
    await writeAuditStrict({
      actorId: user.id,
      action: "tramite.delete",
      entityType: "Tramite",
      entityId: id,
      before: existing,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
