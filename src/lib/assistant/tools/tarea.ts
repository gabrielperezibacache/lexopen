import { createTask, updateTasks } from "@/lib/tasks/service";
import { assistantTransaction } from "@/lib/assistant/transaction-context";
import { secureTool } from "@/lib/assistant/secure-tool";
import { z } from "zod";
import { assistantDb as prisma } from "@/lib/assistant/transaction-context";
import { writeAssistantAudit as writeAuditStrict } from "@/lib/assistant/transaction-context";
import { parseLocalDateInput, formatLocalDate } from "@/lib/minutas";
import { storeUndo, consumeUndo } from "@/lib/assistant/plan-store";
import type { AssistantTool } from "./types";

import { STAFF_ROLES } from "@/lib/auth/roles";

export const tareaCrearSchema = z.object({
  title: z.string().trim().min(1, "Indique el título de la tarea").max(300),
  description: z.string().trim().max(5000).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(),
  dueDate: z.string().trim().max(40).optional(),
  causaId: z.string().optional(),
  siteId: z.string().optional(),
  assigneeId: z.string().optional(),
});
export type TareaCrearInput = z.infer<typeof tareaCrearSchema>;

export const tareaCrearTool: AssistantTool<TareaCrearInput> = secureTool({
  id: "tarea.crear",
  description: "Crea una tarea de seguimiento",
  kind: "write",
  roles: [...STAFF_ROLES],
  inputSchema: tareaCrearSchema,
  preview(input) {
    const due = input.dueDate ? ` — vence ${formatLocalDate(input.dueDate)}` : "";
    return `Crear tarea "${input.title}" (prioridad ${
      input.priority || "media"
    })${due}.`;
  },
  async execute(input, ctx) {
    const dueDate = input.dueDate ? parseLocalDateInput(input.dueDate) : null;
    const tarea = await createTask({ ...ctx, id: ctx.userId }, {
      ...input, dueDate: dueDate?.toISOString() || null, assigneeId: input.assigneeId || ctx.userId, origen: "asistente",
    }, assistantTransaction()!.tx);
    const undoToken = await storeUndo({
      toolId: "tarea.crear",
      entityType: "Task",
      entityId: tarea.id,
    });
    return {
      ok: true,
      message: `Tarea "${tarea.title}" creada.`,
      entityId: tarea.id,
      undoToken,
      card: { type: "tarea", id: tarea.id, title: tarea.title, status: tarea.status },
    };
  },
  async undo(token, ctx) {
    const payload = await consumeUndo(token);
    if (!payload || payload.toolId !== "tarea.crear") {
      return { ok: false, message: "Token de deshacer inválido o vencido." };
    }
    const tarea = await prisma.task.findUnique({ where: { id: payload.entityId } });
    if (!tarea) return { ok: false, message: "La tarea ya no existe." };
    await prisma.task.delete({ where: { id: tarea.id } });
    await writeAuditStrict({
      actorId: ctx.userId,
      action: "tarea.delete",
      entityType: "Task",
      entityId: tarea.id,
      before: tarea,
    });
    return { ok: true, message: `Se deshizo la creación de la tarea "${tarea.title}".` };
  },
});

export const tareaCompletarSchema = z.object({
  taskId: z.string().min(1),
});
export type TareaCompletarInput = z.infer<typeof tareaCompletarSchema>;

export const tareaCompletarTool: AssistantTool<TareaCompletarInput> = secureTool({
  id: "tarea.completar",
  description: "Marca una tarea como completada",
  kind: "write",
  roles: [...STAFF_ROLES],
  inputSchema: tareaCompletarSchema,
  async preview(input) {
    const tarea = await prisma.task.findUnique({ where: { id: input.taskId } });
    if (!tarea) return `Completar tarea ${input.taskId} (no encontrada).`;
    if (tarea.status === "done") return `La tarea "${tarea.title}" ya estaba completada.`;
    return `Marcar tarea "${tarea.title}" como completada (estado actual: ${tarea.status}).`;
  },
  async execute(input, ctx) {
    const before = await prisma.task.findUnique({ where: { id: input.taskId } });
    if (!before) return { ok: false, message: "Tarea no encontrada." };
    if (before.status === "done") return { ok: true, message: `La tarea "${before.title}" ya estaba completada.`, entityId: before.id };
    const [tarea] = await updateTasks({ ...ctx, id: ctx.userId }, [input.taskId], { status: "done" }, undefined, assistantTransaction()!.tx);
    const undoToken = before.rrule ? undefined : await storeUndo({
      toolId: "tarea.completar",
      entityType: "Task",
      entityId: tarea.id,
      before: { status: before.status },
    });
    return {
      ok: true,
      message: `Tarea "${tarea.title}" marcada como completada.`,
      entityId: tarea.id,
      undoToken,
      card: { type: "tarea", id: tarea.id, title: tarea.title, status: tarea.status },
    };
  },
  async undo(token, ctx) {
    const payload = await consumeUndo(token);
    if (!payload || payload.toolId !== "tarea.completar") {
      return { ok: false, message: "Token de deshacer inválido o vencido." };
    }
    const before = payload.before as { status: string };
    const [tarea] = await updateTasks({ ...ctx, id: ctx.userId }, [payload.entityId], { status: before.status }, undefined, assistantTransaction()!.tx);
    return { ok: true, message: `Se restauró el estado de la tarea "${tarea.title}".` };
  },
});
