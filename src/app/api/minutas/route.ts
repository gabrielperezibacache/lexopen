import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";
import {
  renderMinutaMarkdown,
  type MinutaAccionInput,
} from "@/lib/minutas";
import { pushMinutaToDrive } from "@/lib/integrations/google";

export async function GET(req: NextRequest) {
  const causaId = req.nextUrl.searchParams.get("causaId");
  const limit = Math.min(
    Number(req.nextUrl.searchParams.get("limit") || 50),
    100
  );

  const minutas = await prisma.minuta.findMany({
    where: causaId ? { causaId } : undefined,
    include: {
      causa: { select: { id: true, titulo: true, rit: true, tribunal: true } },
      autor: { select: { id: true, name: true, email: true } },
      acciones: { orderBy: { fechaLimite: "asc" } },
      documento: { select: { id: true, nombre: true, googleDriveId: true } },
    },
    orderBy: { fecha: "desc" },
    take: limit,
  });

  return NextResponse.json(minutas);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const user = await getCurrentUser();

  if (!body.causaId || !body.titulo || !body.resumenEjecutivo) {
    return NextResponse.json(
      {
        error:
          "Faltan campos obligatorios: causaId, titulo y resumenEjecutivo.",
      },
      { status: 400 }
    );
  }

  const causa = await prisma.causa.findUnique({
    where: { id: body.causaId },
    include: { site: true },
  });
  if (!causa) {
    return NextResponse.json({ error: "Causa no encontrada" }, { status: 404 });
  }

  const tipo = body.tipo || "reunion";
  const fecha = body.fecha ? new Date(body.fecha) : new Date();
  const accionesInput: MinutaAccionInput[] = Array.isArray(body.acciones)
    ? body.acciones.filter(
        (a: MinutaAccionInput) => a?.descripcion?.trim()
      )
    : [];

  const markdown = renderMinutaMarkdown({
    tipo,
    titulo: body.titulo,
    fecha,
    modalidad: body.modalidad,
    lugar: body.lugar,
    participantes: body.participantes,
    resumenEjecutivo: body.resumenEjecutivo,
    hechosRelevantes: body.hechosRelevantes,
    acuerdos: body.acuerdos,
    proximosPasos: body.proximosPasos,
    riesgosAlertas: body.riesgosAlertas,
    estadoCausaNota: body.estadoCausaNota,
    causa,
    autorName: user?.name,
    acciones: accionesInput,
  });

  const docNombre = `Minuta ${tipo} — ${body.titulo} — ${fecha.toISOString().slice(0, 10)}.md`;

  const documento = await prisma.documento.create({
    data: {
      nombre: docNombre,
      tipo: "minuta",
      mimeType: "text/markdown",
      contenido: markdown,
      causaId: causa.id,
      autorId: user?.id,
    },
  });

  const minuta = await prisma.minuta.create({
    data: {
      tipo,
      titulo: body.titulo,
      fecha,
      modalidad: body.modalidad || "presencial",
      lugar: body.lugar || null,
      participantes: body.participantes || "",
      resumenEjecutivo: body.resumenEjecutivo,
      hechosRelevantes: body.hechosRelevantes || null,
      acuerdos: body.acuerdos || null,
      proximosPasos: body.proximosPasos || null,
      riesgosAlertas: body.riesgosAlertas || null,
      estadoCausaNota: body.estadoCausaNota || null,
      etapaSugerida: body.etapaSugerida || null,
      confidencial: Boolean(body.confidencial),
      causaId: causa.id,
      autorId: user?.id,
      documentoId: documento.id,
    },
  });

  const createdAcciones = [];
  for (const accion of accionesInput) {
    let plazoId: string | undefined;
    let taskId: string | undefined;

    if (accion.crearPlazo && accion.fechaLimite) {
      const plazo = await prisma.plazo.create({
        data: {
          titulo: accion.descripcion.slice(0, 120),
          descripcion: `Derivado de minuta: ${body.titulo}`,
          fechaLimite: new Date(accion.fechaLimite),
          tipo: tipo === "audiencia" ? "procesal" : "interno",
          estado: "pendiente",
          causaId: causa.id,
          responsableId: user?.id,
        },
      });
      plazoId = plazo.id;
    }

    if (accion.crearTask !== false) {
      const task = await prisma.task.create({
        data: {
          title: accion.descripcion.slice(0, 160),
          description: `Handoff desde minuta «${body.titulo}» (${tipo}). Responsable: ${accion.responsable || "por asignar"}`,
          status: "todo",
          priority:
            accion.prioridad === "urgente"
              ? "urgent"
              : accion.prioridad === "alta"
                ? "high"
                : accion.prioridad === "baja"
                  ? "low"
                  : "medium",
          dueDate: accion.fechaLimite ? new Date(accion.fechaLimite) : null,
          siteId: causa.site?.id,
          creatorId: user?.id,
          assigneeId: user?.id,
        },
      });
      taskId = task.id;
    }

    const row = await prisma.minutaAccion.create({
      data: {
        descripcion: accion.descripcion,
        responsable: accion.responsable || null,
        fechaLimite: accion.fechaLimite ? new Date(accion.fechaLimite) : null,
        prioridad: accion.prioridad || "media",
        minutaId: minuta.id,
        plazoId,
        taskId,
      },
    });
    createdAcciones.push(row);
  }

  if (body.etapaSugerida && body.actualizarEtapa) {
    await prisma.causa.update({
      where: { id: causa.id },
      data: { etapa: body.etapaSugerida },
    });
  }

  await prisma.activity.create({
    data: {
      tipo: "minuta",
      mensaje: `Minuta de ${tipo}: ${body.titulo}`,
      causaId: causa.id,
      siteId: causa.site?.id,
      userId: user?.id,
    },
  });

  // Notificar a otros abogados/admin del estudio
  const peers = await prisma.user.findMany({
    where: {
      role: { in: ["admin", "abogado", "asistente"] },
      ...(user ? { id: { not: user.id } } : {}),
    },
    take: 20,
  });
  if (peers.length > 0) {
    await prisma.notification.createMany({
      data: peers.map((p) => ({
        title: `Nueva minuta · ${causa.rit || causa.titulo}`,
        body: `${labelTipo(tipo)}: ${body.titulo}. Revise próximos pasos para continuar la tramitación.`,
        href: `/causas/${causa.id}/minutas/${minuta.id}`,
        userId: p.id,
      })),
    });
  }

  let driveResult = null;
  if (body.subirADrive) {
    try {
      driveResult = await pushMinutaToDrive(minuta.id);
    } catch (e) {
      driveResult = {
        status: "error",
        message: e instanceof Error ? e.message : "Error al subir a Drive",
      };
    }
  }

  const full = await prisma.minuta.findUnique({
    where: { id: minuta.id },
    include: {
      causa: true,
      autor: true,
      acciones: true,
      documento: true,
    },
  });

  return NextResponse.json(
    { minuta: full, acciones: createdAcciones, drive: driveResult },
    { status: 201 }
  );
}

function labelTipo(tipo: string) {
  if (tipo === "audiencia") return "Audiencia";
  if (tipo === "llamada") return "Llamada";
  return "Reunión";
}
