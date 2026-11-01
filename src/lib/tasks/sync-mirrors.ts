/**
 * Espejos Task ↔ Tramite / MinutaAccion (PLAN §6.4).
 * Idempotente: reutiliza Task.tramiteId o MinutaAccion.taskId.
 */

import { prisma } from "@/lib/db";
import type { Prisma, Task } from "@prisma/client";

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

export async function syncTaskFromTramite(tramiteId: string, client: Prisma.TransactionClient = prisma): Promise<Task | null> {
  if (client === prisma) return prisma.$transaction((tx) => syncTaskFromTramite(tramiteId, tx));
  const tr = await client.tramite.findUnique({
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

  const existing = await client.task.findUnique({ where: { tramiteId: tr.id } });
  if (existing) {
    return client.task.update({
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

  return client.task.create({ data });
}

export async function syncTaskFromMinutaAccion(accionId: string, client: Prisma.TransactionClient = prisma): Promise<Task | null> {
  if (client === prisma) return prisma.$transaction((tx) => syncTaskFromMinutaAccion(accionId, tx));
  const ma = await client.minutaAccion.findUnique({
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
    return client.task.update({
      where: { id: ma.taskId },
      data: payload,
    });
  }

  const task = await client.task.create({ data: payload });
  const linked = await client.minutaAccion.updateMany({ where: { id: ma.id, taskId: null }, data: { taskId: task.id } });
  if (linked.count !== 1) throw Object.assign(new Error("La acción cambió mientras se creaba su pendiente"), { status: 409 });
  return task;
}

export async function recordTaskHistorial(opts: {
  taskId: string;
  campo: string;
  antes?: string | null;
  despues?: string | null;
  nota?: string | null;
  actorId?: string | null;
}, client: Prisma.TransactionClient = prisma) {
  return client.taskHistorial.create({
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

/** Reverse changes without re-entering the forward synchronizers. */
export async function syncSourcesFromTask(task: Task, tx: Prisma.TransactionClient) {
  const estado = task.status === "done" ? "hecho" : task.status === "cancelled" ? "cancelado" : task.status === "todo" ? "pendiente" : "en_curso";
  if (task.tramiteId) await tx.tramite.update({ where: { id: task.tramiteId }, data: { titulo: task.title, detalle: task.description, estado, fechaLimite: task.dueDate, responsableId: task.assigneeId, fechaHecho: task.completedAt } });
  await tx.minutaAccion.updateMany({ where: { taskId: task.id }, data: { descripcion: task.title, estado: estado === "hecho" ? "hecha" : estado === "cancelado" ? "cancelada" : estado, fechaLimite: task.dueDate, responsableId: task.assigneeId, prioridad: ({ low: "baja", medium: "media", high: "alta", urgent: "urgente" } as Record<string,string>)[task.priority] || "media" } });
}
