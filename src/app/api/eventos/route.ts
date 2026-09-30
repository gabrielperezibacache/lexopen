import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { writeAuditStrict } from "@/lib/audit";
import { publicUserSelect } from "@/lib/auth/public-user";
import { detectEventConflicts, describeEventConflicts } from "@/lib/assistant/conflicts";

const TIPOS = ["audiencia", "reunion", "recordatorio", "vencimiento", "otro"] as const;
const MODALIDADES = ["presencial", "videollamada", "telefonica", "hibrida", "tribunal"] as const;

const eventoCreateSchema = z.object({
  titulo: z.string().trim().min(1).max(200),
  tipo: z.enum(TIPOS).optional(),
  inicio: z.string().trim().min(1),
  fin: z.string().trim().optional().nullable(),
  todoElDia: z.boolean().optional(),
  lugar: z.string().trim().max(300).optional().nullable(),
  modalidad: z.enum(MODALIDADES).optional().nullable(),
  enlace: z.string().trim().max(2000).optional().nullable(),
  notas: z.string().trim().max(5000).optional().nullable(),
  tipoAudiencia: z.string().trim().max(120).optional().nullable(),
  tribunal: z.string().trim().max(300).optional().nullable(),
  causaId: z.string().optional().nullable(),
  clienteId: z.string().optional().nullable(),
  responsableId: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    await requireStaff();
    const sp = new URL(req.url).searchParams;
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const causaId = sp.get("causaId");

    const eventos = await prisma.evento.findMany({
      where: {
        ...(causaId ? { causaId } : {}),
        ...(desde && hasta
          ? { inicio: { gte: new Date(desde), lte: new Date(hasta) } }
          : {}),
      },
      include: {
        causa: { select: { id: true, titulo: true, rit: true } },
        cliente: { select: { id: true, razonSocial: true } },
        responsable: { select: publicUserSelect },
      },
      orderBy: { inicio: "asc" },
      take: 500,
    });
    return NextResponse.json(eventos);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(req, eventoCreateSchema);

    const inicio = new Date(body.inicio);
    if (Number.isNaN(inicio.getTime())) {
      return NextResponse.json({ error: "Fecha de inicio inválida" }, { status: 400 });
    }
    const fin = body.fin ? new Date(body.fin) : null;
    if (fin && Number.isNaN(fin.getTime())) {
      return NextResponse.json({ error: "Fecha de fin inválida" }, { status: 400 });
    }
    const responsableId = body.responsableId || user.id;

    const conflicts = await detectEventConflicts(inicio, fin, responsableId);

    const evento = await prisma.evento.create({
      data: {
        titulo: body.titulo,
        tipo: body.tipo || "reunion",
        inicio,
        fin,
        todoElDia: Boolean(body.todoElDia),
        lugar: body.lugar || null,
        modalidad: body.modalidad || null,
        enlace: body.enlace || null,
        notas: body.notas || null,
        tipoAudiencia: body.tipoAudiencia || null,
        tribunal: body.tribunal || null,
        causaId: body.causaId || null,
        clienteId: body.clienteId || null,
        responsableId,
      },
    });

    if (evento.causaId) {
      await prisma.activity.create({
        data: {
          tipo: "evento",
          mensaje: `Evento agendado: ${evento.titulo}`,
          causaId: evento.causaId,
          userId: user.id,
        },
      });
    }
    await writeAuditStrict({
      actorId: user.id,
      action: "evento.create",
      entityType: "Evento",
      entityId: evento.id,
      after: evento,
    });

    return NextResponse.json(
      {
        ...evento,
        conflictWarning: conflicts.length ? describeEventConflicts(conflicts) : null,
      },
      { status: 201 }
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
