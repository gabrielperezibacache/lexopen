import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  requireStaff,
} from "@/lib/api";
import { tramiteCreateSchema } from "@/lib/schemas";
import { writeAuditStrict } from "@/lib/audit";
import {
  fechaLimiteFromDias,
  findTemplate,
  templatesForMateria,
} from "@/lib/tramite-templates";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireStaff();
    const { id } = await params;
    const causa = await prisma.causa.findUnique({
      where: { id },
      select: { id: true, materia: true },
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
    return NextResponse.json({
      tramites,
      templates: templatesForMateria(causa.materia),
    });
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
      select: {
        id: true,
        titulo: true,
        materia: true,
        rit: true,
        clienteId: true,
      },
    });
    if (!causa) {
      return NextResponse.json({ error: "Causa no encontrada" }, { status: 404 });
    }
    const tramiteHref = causa.clienteId
      ? `/clientes/${causa.clienteId}`
      : `/causas/${id}#tramites`;

    const raw = await req.json().catch(() => ({}));
    if (raw?.action === "apply-template") {
      const { templateId } = z
        .object({ action: z.literal("apply-template"), templateId: z.string() })
        .parse(raw);
      const template = findTemplate(templateId);
      if (!template) {
        return NextResponse.json({ error: "Plantilla no encontrada" }, { status: 404 });
      }
      const maxOrden = await prisma.tramite.aggregate({
        where: { causaId: id },
        _max: { orden: true },
      });
      let orden = (maxOrden._max.orden ?? 0) + 1;
      const created = await prisma.$transaction(
        template.items.map((item) => {
          const current = orden;
          orden += 1;
          return prisma.tramite.create({
            data: {
              causaId: id,
              titulo: item.titulo,
              detalle: item.detalle || null,
              estado: "pendiente",
              fechaLimite: item.diasLimite
                ? fechaLimiteFromDias(item.diasLimite)
                : null,
              responsableId: user.id,
              orden: current,
            },
          });
        })
      );
      await prisma.activity.create({
        data: {
          tipo: "tramite",
          mensaje: `Plantilla «${template.label}»: +${created.length} trámites`,
          causaId: id,
          userId: user.id,
        },
      });
      await writeAuditStrict({
        actorId: user.id,
        action: "tramite.apply-template",
        entityType: "Causa",
        entityId: id,
        after: { templateId, count: created.length },
      });
      return NextResponse.json({ rows: created.length, tramites: created }, { status: 201 });
    }

    const body = tramiteCreateSchema.parse(raw);
    const maxOrden = await prisma.tramite.aggregate({
      where: { causaId: id },
      _max: { orden: true },
    });
    const estado = body.estado || "pendiente";
    const responsableId = body.responsableId || user.id;
    const tramite = await prisma.tramite.create({
      data: {
        causaId: id,
        titulo: body.titulo.trim(),
        detalle: body.detalle || null,
        estado,
        fechaLimite: body.fechaLimite ? new Date(body.fechaLimite) : null,
        fechaHecho: estado === "hecho" ? new Date() : null,
        responsableId,
        orden: body.orden ?? (maxOrden._max.orden ?? 0) + 1,
      },
      include: {
        responsable: { select: { id: true, name: true } },
      },
    });

    if (responsableId && responsableId !== user.id) {
      await prisma.notification.create({
        data: {
          userId: responsableId,
          title: `Trámite asignado · ${causa.rit || causa.titulo}`,
          body: tramite.titulo,
          href: tramiteHref,
        },
      });
    }

    await prisma.activity.create({
      data: {
        tipo: "tramite",
        mensaje: `Trámite creado: ${tramite.titulo}`,
        causaId: id,
        userId: user.id,
      },
    });
    await writeAuditStrict({
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
