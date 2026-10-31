/**
 * Espejos Task ↔ Tramite / MinutaAccion (PLAN §6.4).
 * Idempotente: reutiliza Task.tramiteId o MinutaAccion.taskId.
 */

import { prisma } from "@/lib/db";

const TRAMITE_STATUS: Record<string, string> = {
  pendiente: "todo",
  en_curso: "in_progress",
  hecho: "done",
  cancelado: "cancelled",
};

const ACCION_STATUS: Record<string, string> = {
  pendiente: "todo",
  en_curso: "in_progress",
  hecha: "done",
  cancelada: "cancelled",
};

const ACCION_PRIORITY: Record<string, string> = {
  baja: "low",
  media: "medium",
  alta: "high",
  urgente: "urgent",
};

export async function syncTaskFromTramite(tramiteId: string) {
  const tr = await prisma.tramite.findUnique({
    where: { id: tramiteId },
    include: { causa: { select: { clienteId: true } } },
  });
  if (!tr) return null;

  const status = TRAMITE_STATUS[tr.estado] || "todo";
  const data = {
    title: tr.titulo.slice(0, 300),
    description: tr.detalle,
    status,
    priority: "medium" as const,
    dueDate: tr.fechaLimite,
    origen: "tramite",
    causaId: tr.causaId,
    clienteId: tr.causa.clienteId,
    assigneeId: tr.responsableId,
    completedAt: status === "done" ? tr.fechaHecho ?? new Date() : null,
    tramiteId: tr.id,
  };

  const existing = await prisma.task.findUnique({ where: { tramiteId: tr.id } });
  if (existing) {
    return prisma.task.update({
      where: { id: existing.id },
      data: {
        title: data.title,
        description: data.description,
        status: data.status,
        dueDate: data.dueDate,
        assigneeId: data.assigneeId,
        completedAt: data.completedAt,
        causaId: data.causaId,
        clienteId: data.clienteId,
      },
    });
  }

  return prisma.task.create({ data });
}

export async function syncTaskFromMinutaAccion(accionId: string) {
  const ma = await prisma.minutaAccion.findUnique({
    where: { id: accionId },
    include: { minuta: { select: { causaId: true } } },
  });
  if (!ma) return null;

  const status = ACCION_STATUS[ma.estado] || "todo";
  const priority = ACCION_PRIORITY[ma.prioridad] || "medium";
  const payload = {
    title: ma.descripcion.slice(0, 300),
    status,
    priority,
    dueDate: ma.fechaLimite,
    origen: "minuta",
    causaId: ma.minuta.causaId,
    plazoId: ma.plazoId,
    assigneeId: ma.responsableId,
    completedAt: status === "done" ? new Date() : null,
  };

  if (ma.taskId) {
    return prisma.task.update({
      where: { id: ma.taskId },
      data: payload,
    });
  }

  const task = await prisma.task.create({ data: payload });
  await prisma.minutaAccion.update({
    where: { id: ma.id },
    data: { taskId: task.id },
  });
  return task;
}

export async function recordTaskHistorial(opts: {
  taskId: string;
  campo: string;
  antes?: string | null;
  despues?: string | null;
  nota?: string | null;
  actorId?: string | null;
}) {
  return prisma.taskHistorial.create({
    data: {
      taskId: opts.taskId,
      campo: opts.campo,
      antes: opts.antes ?? null,
      despues: opts.despues ?? null,
      nota: opts.nota ?? null,
      actorId: opts.actorId ?? null,
    },
  });
}
