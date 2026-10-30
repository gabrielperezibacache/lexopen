import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAuditStrict } from "@/lib/audit";
import { parseLocalDateInput, formatLocalDateTime } from "@/lib/minutas";
import { detectEventConflicts, describeEventConflicts } from "@/lib/assistant/conflicts";
import { storeUndo, consumeUndo } from "@/lib/assistant/plan-store";
import type { AssistantTool } from "./types";

const STAFF_ROLES = ["admin", "abogado", "asistente"] as const;

export const eventoCrearSchema = z.object({
  titulo: z.string().trim().min(1).max(200),
  tipo: z.enum(["audiencia", "reunion", "recordatorio", "vencimiento", "otro"]).optional(),
  inicio: z.string().trim().min(1),
  fin: z.string().trim().optional(),
  todoElDia: z.boolean().optional(),
  lugar: z.string().trim().max(300).optional(),
  modalidad: z.enum(["presencial", "videollamada", "telefonica", "hibrida", "tribunal"]).optional(),
  notas: z.string().trim().max(5000).optional(),
  causaId: z.string().optional(),
  clienteId: z.string().optional(),
  responsableId: z.string().optional(),
});
export type EventoCrearInput = z.infer<typeof eventoCrearSchema>;

export const eventoCrearTool: AssistantTool<EventoCrearInput> = {
  id: "evento.crear",
  description: "Agenda un evento/audiencia/reunión",
  kind: "write",
  roles: [...STAFF_ROLES],
  inputSchema: eventoCrearSchema,
  async preview(input, ctx) {
    const inicio = parseLocalDateInput(input.inicio);
    if (!inicio) return `Agendar "${input.titulo}" — fecha de inicio inválida.`;
    const fin = input.fin ? parseLocalDateInput(input.fin) : null;
    const responsableId = input.responsableId || ctx.userId;
    const conflicts = await detectEventConflicts(inicio, fin, responsableId);
    const warning = describeEventConflicts(conflicts);
    return `Agendar "${input.titulo}" (${input.tipo || "reunion"}) el ${formatLocalDateTime(
      inicio
    )}${warning ? ` — ${warning}` : ""}`;
  },
  async execute(input, ctx) {
    const inicio = parseLocalDateInput(input.inicio);
    if (!inicio) return { ok: false, message: "Fecha de inicio inválida." };
    const fin = input.fin ? parseLocalDateInput(input.fin) : null;
    const responsableId = input.responsableId || ctx.userId;

    const evento = await prisma.evento.create({
      data: {
        titulo: input.titulo,
        tipo: input.tipo || "reunion",
        inicio,
        fin,
        todoElDia: Boolean(input.todoElDia),
        lugar: input.lugar || null,
        modalidad: input.modalidad || null,
        notas: input.notas || null,
        causaId: input.causaId || null,
        clienteId: input.clienteId || null,
        responsableId,
      },
    });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "evento.create",
      entityType: "Evento",
      entityId: evento.id,
      after: evento,
    });
    const undoToken = await storeUndo({
      toolId: "evento.crear",
      entityType: "Evento",
      entityId: evento.id,
    });
    return {
      ok: true,
      message: `Evento "${evento.titulo}" agendado para ${formatLocalDateTime(evento.inicio)}.`,
      entityId: evento.id,
      undoToken,
      card: { type: "evento", id: evento.id, titulo: evento.titulo, inicio: evento.inicio, fin: evento.fin },
    };
  },
  async undo(token, ctx) {
    const payload = await consumeUndo(token);
    if (!payload || payload.toolId !== "evento.crear") {
      return { ok: false, message: "Token de deshacer inválido o vencido." };
    }
    const evento = await prisma.evento.findUnique({ where: { id: payload.entityId } });
    if (!evento) return { ok: false, message: "El evento ya no existe." };
    await prisma.evento.delete({ where: { id: evento.id } });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "evento.delete",
      entityType: "Evento",
      entityId: evento.id,
      before: evento,
    });
    return { ok: true, message: `Se deshizo la creación del evento "${evento.titulo}".` };
  },
};

export const eventoEditarSchema = z.object({
  eventoId: z.string().min(1),
  titulo: z.string().trim().max(200).optional(),
  inicio: z.string().trim().optional(),
  fin: z.string().trim().optional(),
  lugar: z.string().trim().max(300).optional(),
  notas: z.string().trim().max(5000).optional(),
  estado: z.enum(["programado", "cancelado", "realizado"]).optional(),
});
export type EventoEditarInput = z.infer<typeof eventoEditarSchema>;

export const eventoEditarTool: AssistantTool<EventoEditarInput> = {
  id: "evento.editar",
  description: "Edita o reprograma un evento existente",
  kind: "write",
  roles: [...STAFF_ROLES],
  inputSchema: eventoEditarSchema,
  async preview(input) {
    const evento = await prisma.evento.findUnique({ where: { id: input.eventoId } });
    if (!evento) return `Editar evento ${input.eventoId} (no encontrado).`;
    const nuevoInicio = input.inicio ? parseLocalDateInput(input.inicio) : null;
    const conflicts = nuevoInicio
      ? await detectEventConflicts(
          nuevoInicio,
          input.fin ? parseLocalDateInput(input.fin) : evento.fin,
          evento.responsableId,
          evento.id
        )
      : [];
    const warning = describeEventConflicts(conflicts);
    return `Editar "${evento.titulo}"${nuevoInicio ? ` → nueva fecha ${formatLocalDateTime(nuevoInicio)}` : ""}${
      warning ? ` — ${warning}` : ""
    }`;
  },
  async execute(input, ctx) {
    const before = await prisma.evento.findUnique({ where: { id: input.eventoId } });
    if (!before) return { ok: false, message: "Evento no encontrado." };
    const inicio = input.inicio ? parseLocalDateInput(input.inicio) : undefined;
    const fin = input.fin !== undefined ? parseLocalDateInput(input.fin) : undefined;

    const evento = await prisma.evento.update({
      where: { id: input.eventoId },
      data: {
        ...(input.titulo !== undefined ? { titulo: input.titulo } : {}),
        ...(inicio ? { inicio } : {}),
        ...(fin !== undefined ? { fin } : {}),
        ...(input.lugar !== undefined ? { lugar: input.lugar } : {}),
        ...(input.notas !== undefined ? { notas: input.notas } : {}),
        ...(input.estado !== undefined ? { estado: input.estado } : {}),
      },
    });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "evento.update",
      entityType: "Evento",
      entityId: evento.id,
      before,
      after: evento,
    });
    const undoToken = await storeUndo({
      toolId: "evento.editar",
      entityType: "Evento",
      entityId: evento.id,
      before: {
        titulo: before.titulo,
        inicio: before.inicio,
        fin: before.fin,
        lugar: before.lugar,
        notas: before.notas,
        estado: before.estado,
      },
    });
    return {
      ok: true,
      message: `Evento "${evento.titulo}" actualizado.`,
      entityId: evento.id,
      undoToken,
      card: { type: "evento", id: evento.id, titulo: evento.titulo, inicio: evento.inicio, fin: evento.fin },
    };
  },
  async undo(token, ctx) {
    const payload = await consumeUndo(token);
    if (!payload || payload.toolId !== "evento.editar") {
      return { ok: false, message: "Token de deshacer inválido o vencido." };
    }
    const evento = await prisma.evento.update({
      where: { id: payload.entityId },
      data: payload.before as Record<string, unknown>,
    });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "evento.update",
      entityType: "Evento",
      entityId: evento.id,
      after: payload.before,
    });
    return { ok: true, message: `Se restauró el evento "${evento.titulo}".` };
  },
};

export const eventoEliminarSchema = z.object({
  eventoId: z.string().min(1),
});
export type EventoEliminarInput = z.infer<typeof eventoEliminarSchema>;

export const eventoEliminarTool: AssistantTool<EventoEliminarInput> = {
  id: "evento.eliminar",
  description: "Cancela/elimina un evento",
  kind: "write",
  roles: [...STAFF_ROLES],
  inputSchema: eventoEliminarSchema,
  async preview(input) {
    const evento = await prisma.evento.findUnique({ where: { id: input.eventoId } });
    if (!evento) return `Eliminar evento ${input.eventoId} (no encontrado).`;
    return `Eliminar el evento "${evento.titulo}" (${formatLocalDateTime(evento.inicio)}).`;
  },
  async execute(input, ctx) {
    const evento = await prisma.evento.findUnique({ where: { id: input.eventoId } });
    if (!evento) return { ok: false, message: "Evento no encontrado." };
    await prisma.evento.delete({ where: { id: evento.id } });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "evento.delete",
      entityType: "Evento",
      entityId: evento.id,
      before: evento,
    });
    const undoToken = await storeUndo({
      toolId: "evento.eliminar",
      entityType: "Evento",
      entityId: evento.id,
      before: evento,
    });
    return {
      ok: true,
      message: `Evento "${evento.titulo}" eliminado.`,
      entityId: evento.id,
      undoToken,
    };
  },
  async undo(token, ctx) {
    const payload = await consumeUndo(token);
    if (!payload || payload.toolId !== "evento.eliminar") {
      return { ok: false, message: "Token de deshacer inválido o vencido." };
    }
    const before = payload.before as {
      id: string;
      titulo: string;
      tipo: string;
      inicio: string | Date;
      fin: string | Date | null;
      todoElDia: boolean;
      lugar: string | null;
      modalidad: string | null;
      enlace: string | null;
      notas: string | null;
      estado: string;
      tipoAudiencia: string | null;
      tribunal: string | null;
      causaId: string | null;
      clienteId: string | null;
      responsableId: string;
    };
    const evento = await prisma.evento.create({
      data: {
        id: before.id,
        titulo: before.titulo,
        tipo: before.tipo,
        inicio: new Date(before.inicio),
        fin: before.fin ? new Date(before.fin) : null,
        todoElDia: before.todoElDia,
        lugar: before.lugar,
        modalidad: before.modalidad,
        enlace: before.enlace,
        notas: before.notas,
        estado: before.estado,
        tipoAudiencia: before.tipoAudiencia,
        tribunal: before.tribunal,
        causaId: before.causaId,
        clienteId: before.clienteId,
        responsableId: before.responsableId,
      },
    });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "evento.create",
      entityType: "Evento",
      entityId: evento.id,
      after: evento,
    });
    return { ok: true, message: `Se restauró el evento "${evento.titulo}".` };
  },
};
