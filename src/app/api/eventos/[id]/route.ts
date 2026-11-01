import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { describeEventConflicts, detectEventConflicts } from "@/lib/assistant/conflicts";
import { writeAuditStrict } from "@/lib/audit";
import { assertEventMutation, relatedCausaWhere as scopedrelatedCausaWhere } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const TIPOS = ["audiencia", "reunion", "recordatorio", "vencimiento", "otro"] as const;
const MODALIDADES = ["presencial", "videollamada", "telefonica", "hibrida", "tribunal"] as const;
const ESTADOS = ["programado", "cancelado", "realizado"] as const;

type Params = { params: Promise<{ id: string }> };

const eventoUpdateSchema = z.object({
  titulo: z.string().trim().min(1).max(200).optional(),
  tipo: z.enum(TIPOS).optional(),
  inicio: z.string().trim().min(1).optional(),
  fin: z.string().trim().optional().nullable(),
  todoElDia: z.boolean().optional(),
  lugar: z.string().trim().max(300).optional().nullable(),
  modalidad: z.enum(MODALIDADES).optional().nullable(),
  enlace: z.string().trim().max(2000).optional().nullable(),
  notas: z.string().trim().max(5000).optional().nullable(),
  estado: z.enum(ESTADOS).optional(),
  causaId: z.string().optional().nullable(),
  clienteId: z.string().optional().nullable(),
  responsableId: z.string().min(1).optional(),
});

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const before = await prisma.evento.findFirst({ where: { AND: [scopedrelatedCausaWhere(user), { id }] } });
    if (!before) {
      return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
    }
    const body = await parseBody(req, eventoUpdateSchema);
    await assertEventMutation(user, before);
    await assertEventMutation(user, { responsableId: body.responsableId || before.responsableId, causaId: body.causaId !== undefined ? body.causaId : before.causaId });

    const inicio = body.inicio !== undefined ? new Date(body.inicio) : undefined;
    if (inicio && Number.isNaN(inicio.getTime())) {
      return NextResponse.json({ error: "Fecha de inicio inválida" }, { status: 400 });
    }
    const fin =
      body.fin !== undefined ? (body.fin ? new Date(body.fin) : null) : undefined;
    if (fin && Number.isNaN(fin.getTime())) {
      return NextResponse.json({ error: "Fecha de fin inválida" }, { status: 400 });
    }

    const conflicts =
      inicio || fin !== undefined
        ? await detectEventConflicts(
            inicio || before.inicio,
            fin !== undefined ? fin : before.fin,
            body.responsableId || before.responsableId,
            id,
            user
          )
        : [];

    const evento = await prisma.evento.update({
      where: { id },
      data: {
        ...(body.titulo !== undefined ? { titulo: body.titulo } : {}),
        ...(body.tipo !== undefined ? { tipo: body.tipo } : {}),
        ...(inicio ? { inicio } : {}),
        ...(fin !== undefined ? { fin } : {}),
        ...(body.todoElDia !== undefined ? { todoElDia: body.todoElDia } : {}),
        ...(body.lugar !== undefined ? { lugar: body.lugar } : {}),
        ...(body.modalidad !== undefined ? { modalidad: body.modalidad } : {}),
        ...(body.enlace !== undefined ? { enlace: body.enlace } : {}),
        ...(body.notas !== undefined ? { notas: body.notas } : {}),
        ...(body.estado !== undefined ? { estado: body.estado } : {}),
        ...(body.causaId !== undefined ? { causaId: body.causaId } : {}),
        ...(body.clienteId !== undefined ? { clienteId: body.clienteId } : {}),
        ...(body.responsableId !== undefined ? { responsableId: body.responsableId } : {}),
      },
    });

    await writeAuditStrict({
      actorId: user.id,
      action: "evento.update",
      entityType: "Evento",
      entityId: evento.id,
      before,
      after: evento,
    });

    return NextResponse.json({
      ...evento,
      conflictWarning: conflicts.length ? describeEventConflicts(conflicts) : null,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const evento = await prisma.evento.findFirst({ where: { AND: [scopedrelatedCausaWhere(user), { id }] } });
    if (!evento) {
      return NextResponse.json({ error: "Evento no encontrado" }, { status: 404 });
    }
    await assertEventMutation(user, evento);
    await prisma.evento.delete({ where: { id } });
    await writeAuditStrict({
      actorId: user.id,
      action: "evento.delete",
      entityType: "Evento",
      entityId: evento.id,
      before: evento,
    });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
