import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { googleActionHttpStatus, pushMinutaToDrive } from "@/lib/integrations/google";
import {
  isValidEstadoAccion,
  renderMinutaMarkdown,
} from "@/lib/minutas";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { writeAuditStrict } from "@/lib/audit";
import { publicUserSelect } from "@/lib/auth/public-user";
import { documentoListSelect } from "@/lib/sites/file-select";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
  const user = await requireStaff();
  const { id } = await params;
  const minuta = await prisma.minuta.findUnique({
    where: { id },
    include: {
      causa: {
        include: {
          cliente: true,
          abogado: { select: publicUserSelect },
          partes: true,
        },
      },
      autor: { select: publicUserSelect },
      acciones: true,
      documento: { select: documentoListSelect },
    },
  });
  if (!minuta) {
    return NextResponse.json({ error: "Minuta no encontrada" }, { status: 404 });
  }
  if (minuta.confidencial && !canSeeConfidential(user.role)) {
    return NextResponse.json({ error: "Minuta confidencial" }, { status: 403 });
  }

  // Orden: abiertas primero, luego por fecha
  const rank: Record<string, number> = {
    pendiente: 0,
    en_curso: 1,
    hecha: 2,
    cancelada: 3,
  };
  minuta.acciones.sort((a, b) => {
    const ra = rank[a.estado] ?? 9;
    const rb = rank[b.estado] ?? 9;
    if (ra !== rb) return ra - rb;
    const da = a.fechaLimite?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const db = b.fechaLimite?.getTime() ?? Number.MAX_SAFE_INTEGER;
    return da - db;
  });

  return NextResponse.json(minuta);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
  assertCsrf(req);
  const user = await requireStaff();
  const { id } = await params;
  const body = await req.json();

  const existingMinuta = await prisma.minuta.findUnique({
    where: { id },
    select: { id: true, confidencial: true },
  });
  if (!existingMinuta) {
    return NextResponse.json({ error: "Minuta no encontrada" }, { status: 404 });
  }
  if (existingMinuta.confidencial && !canSeeConfidential(user.role)) {
    return NextResponse.json({ error: "Minuta confidencial" }, { status: 403 });
  }
  if (body.confidencial === true && !canSeeConfidential(user.role)) {
    return NextResponse.json(
      { error: "Su rol no puede marcar minutas como confidenciales" },
      { status: 403 }
    );
  }

  if (body.action === "push-drive") {
    try {
      const result = await pushMinutaToDrive(id, { role: user.role });
      return NextResponse.json(result, {
        status: googleActionHttpStatus(result.status),
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Error Drive" },
        { status: 400 }
      );
    }
  }

  if (body.action === "accion-estado" && body.accionId && body.estado) {
    if (!isValidEstadoAccion(body.estado)) {
      return NextResponse.json(
        { error: `Estado inválido: ${body.estado}` },
        { status: 400 }
      );
    }

    const existing = await prisma.minutaAccion.findFirst({
      where: { id: body.accionId, minutaId: id },
    });
    if (!existing) {
      return NextResponse.json(
        { error: "Acción no pertenece a esta minuta" },
        { status: 404 }
      );
    }

    const accion = await prisma.minutaAccion.update({
      where: { id: existing.id },
      data: { estado: body.estado },
    });

    if (accion.taskId) {
      if (body.estado === "hecha") {
        await prisma.task.update({
          where: { id: accion.taskId },
          data: { status: "done" },
        });
      } else if (body.estado === "pendiente" || body.estado === "en_curso") {
        await prisma.task.update({
          where: { id: accion.taskId },
          data: { status: body.estado === "en_curso" ? "in_progress" : "todo" },
        });
      } else if (body.estado === "cancelada") {
        await prisma.task.update({
          where: { id: accion.taskId },
          data: { status: "blocked" },
        });
      }
    }

    if (accion.plazoId) {
      if (body.estado === "hecha") {
        await prisma.plazo.update({
          where: { id: accion.plazoId },
          data: { estado: "cumplido" },
        });
      } else if (body.estado === "pendiente" || body.estado === "en_curso") {
        await prisma.plazo.update({
          where: { id: accion.plazoId },
          data: { estado: "pendiente" },
        });
      } else if (body.estado === "cancelada") {
        // Cancelación ≠ cumplimiento: mantener el plazo abierto.
        await prisma.plazo.update({
          where: { id: accion.plazoId },
          data: { estado: "pendiente" },
        });
      }
    }

    return NextResponse.json(accion);
  }

  const current = await prisma.minuta.findUnique({
    where: { id },
    include: {
      causa: true,
      autor: { select: publicUserSelect },
      acciones: true,
    },
  });
  if (!current) {
    return NextResponse.json({ error: "Minuta no encontrada" }, { status: 404 });
  }

  const data: Record<string, unknown> = {};
  const editableKeys = [
    "titulo",
    "resumenEjecutivo",
    "hechosRelevantes",
    "acuerdos",
    "proximosPasos",
    "riesgosAlertas",
    "estadoCausaNota",
    "participantes",
    "lugar",
    "modalidad",
    "confidencial",
  ] as const;
  for (const key of editableKeys) {
    if (body[key] !== undefined) data[key] = body[key];
  }

  const minuta = await prisma.minuta.update({
    where: { id },
    data,
  });

  // Regenerar Markdown del documento vinculado
  if (current.documentoId) {
    const refreshed = await prisma.minuta.findUnique({
      where: { id },
      include: { causa: true, autor: true, acciones: true },
    });
    if (refreshed) {
      const md = renderMinutaMarkdown({
        tipo: refreshed.tipo,
        titulo: refreshed.titulo,
        fecha: refreshed.fecha,
        modalidad: refreshed.modalidad,
        lugar: refreshed.lugar,
        participantes: refreshed.participantes,
        resumenEjecutivo: refreshed.resumenEjecutivo,
        hechosRelevantes: refreshed.hechosRelevantes,
        acuerdos: refreshed.acuerdos,
        proximosPasos: refreshed.proximosPasos,
        riesgosAlertas: refreshed.riesgosAlertas,
        estadoCausaNota: refreshed.estadoCausaNota,
        causa: refreshed.causa,
        autorName: refreshed.autor?.name,
        acciones: refreshed.acciones,
      });
      await prisma.documento.update({
        where: { id: current.documentoId },
        data: { contenido: md },
      });
    }
  }

  if (Object.keys(data).length > 0) {
    await writeAuditStrict({
      actorId: user.id,
      action: "minuta.update",
      entityType: "Minuta",
      entityId: id,
      before: Object.fromEntries(editableKeys.map((key) => [key, current[key]])),
      after: Object.fromEntries(editableKeys.map((key) => [key, minuta[key]])),
    });
  }

  return NextResponse.json(minuta);
  } catch (e) {
    return handleRouteError(e);
  }
}
