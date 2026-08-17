import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  minutaConfidentialWhere,
  requireStaff,
} from "@/lib/api";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { isRealDriveFolderId } from "@/lib/integrations/drive-folder";
import { pushMinutaToDrive } from "@/lib/integrations/google";
import { writeAuditStrict } from "@/lib/audit";
import { publicUserSelect } from "@/lib/auth/public-user";
import { documentoListSelect } from "@/lib/sites/file-select";
import { calcularVencimiento } from "@/lib/plazos";
import {
  formatLocalDate,
  isValidModalidad,
  isValidPrioridad,
  isValidTipoMinuta,
  labelTipoMinuta,
  mapPrioridadToTask,
  parseLocalDateInput,
  renderMinutaMarkdown,
  type MinutaAccionInput,
} from "@/lib/minutas";

export async function GET(req: NextRequest) {
  try {
  const user = await requireStaff();
  const causaId = req.nextUrl.searchParams.get("causaId");
  const rawLimit = Number(req.nextUrl.searchParams.get("limit") || 50);
  const limit = Number.isFinite(rawLimit)
    ? Math.min(Math.max(Math.trunc(rawLimit), 1), 100)
    : 50;

  const minutas = await prisma.minuta.findMany({
    where: {
      ...(causaId ? { causaId } : {}),
      ...minutaConfidentialWhere(user.role),
    },
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
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
  assertCsrf(req);
  const body = await req.json();
  const user = await requireStaff();

  if (!body.causaId || !body.titulo?.trim() || !body.resumenEjecutivo?.trim()) {
    return NextResponse.json(
      {
        error:
          "Faltan campos obligatorios: causaId, titulo y resumenEjecutivo.",
      },
      { status: 400 }
    );
  }

  const tipo = body.tipo || "reunion";
  if (!isValidTipoMinuta(tipo)) {
    return NextResponse.json(
      { error: `Tipo de minuta inválido: ${tipo}` },
      { status: 400 }
    );
  }

  const modalidad = body.modalidad || "presencial";
  if (!isValidModalidad(modalidad)) {
    return NextResponse.json(
      { error: `Modalidad inválida: ${modalidad}` },
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
  if (Boolean(body.confidencial) && !canSeeConfidential(user.role)) {
    return NextResponse.json(
      { error: "Su rol no puede crear minutas confidenciales" },
      { status: 403 }
    );
  }

  const fecha = body.fecha
    ? parseLocalDateInput(body.fecha) || new Date(body.fecha)
    : new Date();
  if (Number.isNaN(fecha.getTime())) {
    return NextResponse.json({ error: "Fecha inválida" }, { status: 400 });
  }

  const accionesInput: MinutaAccionInput[] = Array.isArray(body.acciones)
    ? body.acciones
        .filter((a: MinutaAccionInput) => a?.descripcion?.trim())
        .map((a: MinutaAccionInput) => ({
          descripcion: a.descripcion.trim(),
          responsable: a.responsable?.trim() || undefined,
          fechaLimite: a.fechaLimite || null,
          diasPlazo: a.diasPlazo ? Number(a.diasPlazo) : null,
          tipoComputo: a.tipoComputo === "corridos" ? "corridos" : "habiles",
          esFatal: Boolean(a.esFatal),
          prioridad: a.prioridad || "media",
          crearPlazo: Boolean(a.crearPlazo),
          crearTask: a.crearTask !== false,
        }))
    : [];

  for (const a of accionesInput) {
    if (a.prioridad && !isValidPrioridad(a.prioridad)) {
      return NextResponse.json(
        { error: `Prioridad inválida: ${a.prioridad}` },
        { status: 400 }
      );
    }
    if (a.crearPlazo && !a.fechaLimite && !a.diasPlazo) {
      return NextResponse.json(
        {
          error: `La acción «${a.descripcion}» pide crear plazo pero no tiene fecha ni días plazo.`,
        },
        { status: 400 }
      );
    }
  }

  const markdown = renderMinutaMarkdown({
    tipo,
    titulo: body.titulo.trim(),
    fecha,
    modalidad,
    lugar: body.lugar,
    participantes: body.participantes,
    resumenEjecutivo: body.resumenEjecutivo.trim(),
    hechosRelevantes: body.hechosRelevantes,
    acuerdos: body.acuerdos,
    proximosPasos: body.proximosPasos,
    riesgosAlertas: body.riesgosAlertas,
    estadoCausaNota: body.estadoCausaNota,
    causa,
    autorName: user?.name,
    acciones: accionesInput,
  });

  const docNombre = `Minuta ${tipo} — ${body.titulo.trim()} — ${formatLocalDate(fecha)}.md`;

  const { minuta, createdAcciones } = await prisma.$transaction(async (tx) => {
    const documento = await tx.documento.create({
      data: {
        nombre: docNombre,
        tipo: "minuta",
        mimeType: "text/markdown",
        contenido: markdown,
        causaId: causa.id,
        autorId: user?.id,
      },
    });

    const minutaRow = await tx.minuta.create({
      data: {
        tipo,
        titulo: body.titulo.trim(),
        fecha,
        modalidad,
        lugar: body.lugar?.trim() || null,
        participantes: body.participantes?.trim() || "",
        resumenEjecutivo: body.resumenEjecutivo.trim(),
        hechosRelevantes: body.hechosRelevantes?.trim() || null,
        acuerdos: body.acuerdos?.trim() || null,
        proximosPasos: body.proximosPasos?.trim() || null,
        riesgosAlertas: body.riesgosAlertas?.trim() || null,
        estadoCausaNota: body.estadoCausaNota?.trim() || null,
        etapaSugerida: body.etapaSugerida || null,
        confidencial: Boolean(body.confidencial),
        causaId: causa.id,
        autorId: user?.id,
        documentoId: documento.id,
      },
    });

    const acciones = [];
    for (const accion of accionesInput) {
      let plazoId: string | undefined;
      let taskId: string | undefined;
      const due =
        parseLocalDateInput(accion.fechaLimite) ||
        (accion.diasPlazo
          ? calcularVencimiento({
              desde: fecha,
              dias: accion.diasPlazo,
              tipoComputo: accion.tipoComputo || "habiles",
            })
          : null);

      if (accion.crearPlazo && due) {
        const plazo = await tx.plazo.create({
          data: {
            titulo: accion.descripcion.slice(0, 120),
            descripcion: `Derivado de minuta: ${body.titulo.trim()}`,
            fechaLimite: due,
            diasPlazo: accion.diasPlazo || null,
            tipoComputo: accion.tipoComputo || "habiles",
            esFatal: Boolean(accion.esFatal),
            tipo: tipo === "audiencia" ? "procesal" : "interno",
            estado: "pendiente",
            causaId: causa.id,
            responsableId: user?.id,
          },
        });
        plazoId = plazo.id;
      }

      if (accion.crearTask) {
        let assigneeId: string | null = null;
        if (accion.responsable) {
          const needle = accion.responsable.toLowerCase();
          const users = await tx.user.findMany({
            where: { role: { in: ["admin", "abogado", "asistente"] } },
            select: { id: true, name: true, email: true },
          });
          const match = users.find(
            (u) =>
              u.name.toLowerCase() === needle ||
              u.email.toLowerCase() === needle ||
              u.name.toLowerCase().includes(needle) ||
              needle.includes(u.name.toLowerCase().split(" ")[0] || "")
          );
          assigneeId = match?.id ?? null;
        }

        const task = await tx.task.create({
          data: {
            title: accion.descripcion.slice(0, 160),
            description: `Handoff desde minuta «${body.titulo.trim()}» (${tipo}). Responsable: ${accion.responsable || "por asignar"}`,
            status: "todo",
            priority: mapPrioridadToTask(accion.prioridad),
            dueDate: due,
            siteId: causa.site?.id,
            creatorId: user?.id,
            assigneeId,
          },
        });
        taskId = task.id;
      }

      const row = await tx.minutaAccion.create({
        data: {
          descripcion: accion.descripcion,
          responsable: accion.responsable || null,
          fechaLimite: due,
          prioridad: accion.prioridad || "media",
          minutaId: minutaRow.id,
          plazoId,
          taskId,
        },
      });
      acciones.push(row);
    }

    if (body.etapaSugerida && body.actualizarEtapa) {
      await tx.causa.update({
        where: { id: causa.id },
        data: { etapa: body.etapaSugerida },
      });
    }

    await tx.activity.create({
      data: {
        tipo: "minuta",
        mensaje: `Minuta de ${labelTipoMinuta(tipo).toLowerCase()}: ${body.titulo.trim()}`,
        causaId: causa.id,
        siteId: causa.site?.id,
        userId: user?.id,
      },
    });

    return { minuta: minutaRow, createdAcciones: acciones };
  });

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
        body: `${labelTipoMinuta(tipo)}: ${body.titulo.trim()}. Revise próximos pasos para continuar la tramitación.`,
        href: `/causas/${causa.id}/minutas/${minuta.id}`,
        userId: p.id,
      })),
    });
  }

  let driveResult: Record<string, unknown> | null = null;
  const wantsDrive = Boolean(body.subirADrive);
  const canUpload = isRealDriveFolderId(causa.googleDriveFolderId);

  if (wantsDrive) {
    if (!canUpload) {
      driveResult = {
        status: "needs_real_folder",
        message:
          "Minuta guardada. Para subir a Drive, vincule o cree una carpeta real en la causa (no stub/demo).",
      };
    } else {
      try {
        driveResult = await pushMinutaToDrive(minuta.id, {
          role: user.role,
        });
      } catch (e) {
        driveResult = {
          status: "error",
          message: e instanceof Error ? e.message : "Error al subir a Drive",
        };
      }
    }
  }

  const full = await prisma.minuta.findUnique({
    where: { id: minuta.id },
    include: {
      causa: true,
      autor: { select: publicUserSelect },
      acciones: true,
      documento: { select: documentoListSelect },
    },
  });

  await writeAuditStrict({
    actorId: user.id,
    action: "minuta.create",
    entityType: "Minuta",
    entityId: minuta.id,
    after: { titulo: body.titulo, tipo, confidencial: Boolean(body.confidencial) },
  });

  return NextResponse.json(
    {
      minuta: full,
      acciones: createdAcciones,
      drive: driveResult,
      warnings:
        driveResult &&
        typeof driveResult.status === "string" &&
        !["uploaded"].includes(driveResult.status)
          ? [driveResult.message || driveResult.status]
          : [],
    },
    { status: 201 }
  );
  } catch (e) {
    return handleRouteError(e);
  }
}
