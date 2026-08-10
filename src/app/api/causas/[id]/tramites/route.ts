import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { tramiteCreateSchema } from "@/lib/schemas";
import { writeAudit } from "@/lib/audit";

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
    const tramites = await prisma.tramite.findMany({
      where: { causaId: id },
      include: {
        responsable: { select: { id: true, name: true } },
      },
      orderBy: [{ orden: "asc" }, { createdAt: "asc" }],
    });
    return NextResponse.json(tramites);
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
      select: { id: true, titulo: true },
    });
    if (!causa) {
      return NextResponse.json({ error: "Causa no encontrada" }, { status: 404 });
    }
    const body = await parseBody(req, tramiteCreateSchema);
    const maxOrden = await prisma.tramite.aggregate({
      where: { causaId: id },
      _max: { orden: true },
    });
    const estado = body.estado || "pendiente";
    const tramite = await prisma.tramite.create({
      data: {
        causaId: id,
        titulo: body.titulo.trim(),
        detalle: body.detalle || null,
        estado,
        fechaLimite: body.fechaLimite ? new Date(body.fechaLimite) : null,
        fechaHecho: estado === "hecho" ? new Date() : null,
        responsableId: body.responsableId || user.id,
        orden: body.orden ?? (maxOrden._max.orden ?? 0) + 1,
      },
      include: {
        responsable: { select: { id: true, name: true } },
      },
    });

    await prisma.activity.create({
      data: {
        tipo: "tramite",
        mensaje: `Trámite creado: ${tramite.titulo}`,
        causaId: id,
        userId: user.id,
      },
    });
    await writeAudit({
      actorId: user.id,
      action: "tramite.create",
      entityType: "Tramite",
      entityId: tramite.id,
      after: tramite,
    });

    return NextResponse.json(tramite, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
