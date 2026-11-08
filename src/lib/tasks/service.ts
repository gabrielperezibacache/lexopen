import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import { assertCausaAccess, plazoAccessWhere, siteAccessWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { activeDelegadorIds } from "@/lib/auth/delegacion";
import { can } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { currentStaffActor } from "@/lib/auth/staff-actor";
import { executeCommand } from "@/lib/command-execution";
import { parseDateInput } from "@/lib/date-input";
import { prisma } from "@/lib/db";
import { emitNotification } from "@/lib/notify/emit";
import { Prisma, type Task } from "@prisma/client";
import { z } from "zod";
import { syncSourcesFromTask } from "./sync-mirrors";
import { taskWorkspaceAccessWhere } from "./workspace";
import { applyTaskCompletionEffects } from "./completion";

const nullableId = z.string().min(1).max(100).nullable();
const date = z.string().max(100).refine((s) => parseDateInput(s) !== null, "Fecha inválida").nullable();
export const taskChangesSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(), description: z.string().max(20000).nullable().optional(),
  instructions: z.string().max(20000).nullable().optional(), considerations: z.string().max(20000).nullable().optional(),
  status: z.enum(["todo", "in_progress", "blocked", "waiting_client", "done", "cancelled"]).optional(),
  priority: z.enum(["low", "medium", "high", "urgent"]).optional(), dueDate: date.optional(), remindAt: date.optional(),
  assigneeId: nullableId.optional(), causaId: nullableId.optional(), clienteId: nullableId.optional(), siteId: nullableId.optional(),
  plazoId: nullableId.optional(), eventoId: nullableId.optional(), parentId: nullableId.optional(),
  waitingOn: z.enum(["cliente", "tribunal", "contraparte", "interno"]).nullable().optional(),
  rrule: z.string().max(100).regex(/^FREQ=(DAILY|WEEKLY|MONTHLY)(;INTERVAL=[1-9]\d{0,2})?$/).nullable().optional(),
  origen: z.enum(["manual", "minuta", "pjud", "checklist", "tramite", "asistente", "voz", "intake", "aprobacion"]).optional(),
});
type Changes = z.infer<typeof taskChangesSchema>;
const taskCreateSchema = taskChangesSchema.extend({ title: z.string().trim().min(1).max(300) });
const taskUpdateSchema = taskChangesSchema.extend({ expectedUpdatedAt: z.string().datetime().optional() });
const taskIdsSchema = z.array(z.string().min(1).max(100)).min(1).max(100);
type TaskOwner = { assigneeId: string | null; creatorId: string | null };

export function taskMutationPermissions(user: CausaAccessUser, task: TaskOwner, delegatedFrom: string[]) {
  const own = task.assigneeId === user.id || task.creatorId === user.id;
  const delegated = task.assigneeId !== null && delegatedFrom.includes(task.assigneeId);
  const edit = own || delegated || can(user, "task.assign");
  return { edit, assignOthers: edit && (delegated || can(user, "task.assign", { own })) };
}

async function references(data: Pick<Changes, "causaId" | "siteId" | "parentId" | "plazoId" | "eventoId" | "clienteId" | "assigneeId">, user: CausaAccessUser, tx: Prisma.TransactionClient) {
  let cause = data.causaId || null;
  if (data.siteId) {
    const site = await tx.site.findFirst({ where: { id: data.siteId, ...siteAccessWhere(user) }, select: { causaId: true } });
    if (!site) throw httpError("Espacio no encontrado", 404);
    if (cause && site.causaId && cause !== site.causaId) throw httpError("Referencias de expediente incompatibles", 400);
    cause ||= site.causaId;
  }
  if (cause) await assertCausaAccess(cause, user, undefined, tx);
  if (data.parentId) {
    const parent = await tx.task.findFirst({ where: { id: data.parentId, ...taskWorkspaceAccessWhere(user) }, select: { causaId: true } });
    if (!parent) throw httpError("Tarea padre no encontrada", 404);
    if (cause && parent.causaId && cause !== parent.causaId) throw httpError("Referencias de expediente incompatibles", 400);
    cause ||= parent.causaId;
  }
  for (const key of ["plazoId", "eventoId"] as const) {
    const id = data[key];
    if (!id) continue;
    const resource = key === "plazoId"
      ? await tx.plazo.findFirst({ where: { AND: [{ id }, plazoAccessWhere(user)] }, select: { causaId: true } })
      : await tx.evento.findUnique({ where: { id }, select: { causaId: true } });
    if (!resource) throw httpError("Referencia no encontrada", 404);
    if (resource.causaId) await assertCausaAccess(resource.causaId, user, undefined, tx);
    if (cause && resource.causaId && cause !== resource.causaId) throw httpError("Referencias de expediente incompatibles", 400);
    cause ||= resource.causaId;
  }
  if (data.clienteId && cause) {
    const c = await tx.causa.findUniqueOrThrow({ where: { id: cause }, select: { clienteId: true } });
    if (c.clienteId !== data.clienteId) throw httpError("El cliente no corresponde al expediente", 400);
  }
  if (data.assigneeId) {
    const target = await tx.user.findUnique({ where: { id: data.assigneeId } });
    if (!target || !isStaff(target.role)) throw httpError("El asignado debe ser un usuario del estudio", 400);
    if (cause) await assertCausaAccess(cause, target, undefined, tx);
  }
  return cause;
}

async function transaction<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>, client?: Prisma.TransactionClient) {
  if (client) return fn(client);
  for (let attempt = 0; ; attempt++) {
    try { return await prisma.$transaction(fn, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (error) { if (attempt >= 2 || !(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034") throw error; }
  }
}

export async function createTask(user: CausaAccessUser, input: unknown, client?: Prisma.TransactionClient) {
  const data = taskCreateSchema.parse(input);
  return transaction(async (tx) => {
    const actor = await currentStaffActor(user, tx);
    if (data.assigneeId && data.assigneeId !== actor.id && !can(actor, "task.assign")) throw httpError("No puede asignar tareas a otros", 403);
    const causaId = await references(data, actor, tx);
    const task = await tx.task.create({ data: { ...data, causaId, dueDate: data.dueDate ? parseDateInput(data.dueDate) : null, remindAt: data.remindAt ? parseDateInput(data.remindAt) : null, creatorId: actor.id, completedAt: data.status === "done" ? new Date() : null, completedById: data.status === "done" ? actor.id : null } });
    await tx.taskHistorial.create({ data: { taskId: task.id, campo: "creada", despues: task.status, actorId: user.id } });
    await writeAuditStrict({ actorId: user.id, action: "task.create", entityType: "Task", entityId: task.id }, tx);
    if (task.assigneeId) await emitNotification({ tipo: "tarea.asignada", userId: task.assigneeId, title: "Nueva tarea asignada", body: task.title, href: "/tareas", entityType: "task", entityId: task.id }, tx);
    return task;
  }, client);
}

/** One command path for single, bulk, site and delegation mutations. */
export async function updateTasks(user: CausaAccessUser, ids: string[], input: unknown, siteId?: string, client?: Prisma.TransactionClient) {
  const { expectedUpdatedAt, ...changes } = taskUpdateSchema.parse(input);
  const uniqueIds = [...new Set(taskIdsSchema.parse(ids))];
  return transaction(async (tx) => {
    const actor = await currentStaffActor(user, tx);
    const delegators = await activeDelegadorIds(actor.id, "task.assign", tx);
    const rows = await tx.task.findMany({ where: { id: { in: uniqueIds }, ...taskWorkspaceAccessWhere(actor), ...(siteId ? { siteId } : {}) } });
    if (rows.length !== uniqueIds.length) throw httpError("Tarea no encontrada", 404);
    const result = [];
    for (const before of rows) {
      const permissions = taskMutationPermissions(actor, before, delegators);
      if (!permissions.edit) throw httpError("No puede modificar esta tarea", 403);
      if (expectedUpdatedAt && new Date(expectedUpdatedAt).getTime() !== before.updatedAt.getTime()) {
        throw httpError("Esta tarea cambió. Recargue la lista antes de guardar sus cambios.", 409);
      }
      if (changes.assigneeId !== undefined && changes.assigneeId !== before.assigneeId) {
        if (changes.assigneeId !== user.id && !permissions.assignOthers) throw httpError("No puede reasignar esta tarea", 403);
        if (changes.assigneeId) {
          const target = await tx.user.findUnique({ where: { id: changes.assigneeId } });
          if (!target || !isStaff(target.role)) throw httpError("El asignado debe ser un usuario del estudio", 400);
          const visible = await tx.task.findFirst({ where: { id: before.id, ...taskWorkspaceAccessWhere(target) }, select: { id: true } });
          if (!visible) throw httpError("El asignado no tiene acceso a esta tarea", 403);
        }
      }
      const merged = { ...before, ...changes };
      const causaId = await references(merged, actor, tx);
      if (changes.parentId) {
        // UNION terminates even when legacy data already contains a cycle.
        const cycle = await tx.$queryRaw<{ id: string }[]>`
          WITH RECURSIVE ancestors AS (
            SELECT id, "parentId" FROM "Task" WHERE id = ${changes.parentId}
            UNION
            SELECT t.id, t."parentId" FROM "Task" t JOIN ancestors a ON t.id = a."parentId"
          ) SELECT id FROM ancestors WHERE id = ${before.id}`;
        if (cycle.length) throw httpError("Una tarea no puede depender de sí misma ni de sus subtareas", 400);
      }
      // A mirrored task cannot be detached or moved away from its source matter.
      if (before.origen !== "manual" && causaId !== before.causaId) throw httpError("El expediente del pendiente se modifica desde su origen", 409);
      const nextStatus = changes.status ?? before.status;
      const completed = nextStatus === "done" && before.status !== "done";
      const task = await tx.task.update({ where: { id: before.id, updatedAt: before.updatedAt }, data: { ...changes, causaId, dueDate: changes.dueDate === undefined ? undefined : changes.dueDate ? parseDateInput(changes.dueDate) : null, remindAt: changes.remindAt === undefined ? undefined : changes.remindAt ? parseDateInput(changes.remindAt) : null, completedAt: completed ? new Date() : nextStatus !== "done" ? null : before.completedAt, completedById: completed ? user.id : nextStatus !== "done" ? null : before.completedById } });
      await syncSourcesFromTask(task, tx);
      await tx.taskHistorial.create({ data: { taskId: task.id, campo: "estado", antes: JSON.stringify({ status: before.status, assigneeId: before.assigneeId }), despues: JSON.stringify(changes), actorId: user.id } });
      await writeAuditStrict({ actorId: user.id, action: "task.update", entityType: "Task", entityId: task.id, before: { status: before.status, assigneeId: before.assigneeId }, after: changes }, tx);
      if (task.assigneeId && task.assigneeId !== before.assigneeId) await emitNotification({ tipo: "tarea.reasignada", userId: task.assigneeId, title: "Tarea reasignada", body: task.title, href: "/tareas", entityType: "task", entityId: task.id }, tx);
      if (completed) await applyTaskCompletionEffects(task, user.id, tx);
      result.push(task);
    }
    return result;
  }, client);
}

async function authorizeReplay(user: CausaAccessUser, ids: string[], tx: Prisma.TransactionClient, siteId?: string) {
  const actor = await currentStaffActor(user, tx);
  const rows = await tx.task.findMany({ where: { id: { in: ids }, ...taskWorkspaceAccessWhere(actor), ...(siteId ? { siteId } : {}) } });
  if (rows.length !== ids.length) throw httpError("Tarea no encontrada", 404);
  const delegators = await activeDelegadorIds(actor.id, "task.assign", tx);
  if (rows.some(row => !taskMutationPermissions(actor, row, delegators).edit)) throw httpError("No puede modificar esta tarea", 403);
}

/** Receipts cover tasks, histories, notifications, mirrors and completion effects together. */
export async function createTaskCommand(user: CausaAccessUser, input: unknown, key: string) {
  const data = taskCreateSchema.parse(input);
  return executeCommand<Task>({ key, ownerId: user.id, input: data,
    authorize: async (tx, result) => { if (result) await authorizeReplay(user, [result.id], tx); },
    run: tx => createTask(user, data, tx),
  });
}

export async function updateTasksCommand(user: CausaAccessUser, ids: string[], input: unknown, key: string, siteId?: string) {
  const data = taskUpdateSchema.parse(input), uniqueIds = [...new Set(taskIdsSchema.parse(ids))].sort();
  return executeCommand<Task[]>({ key, ownerId: user.id, input: { ids: uniqueIds, changes: data, siteId },
    authorize: async (tx, result) => { if (result) await authorizeReplay(user, uniqueIds, tx, siteId); },
    run: tx => updateTasks(user, uniqueIds, data, siteId, tx),
  });
}
