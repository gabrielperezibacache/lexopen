import type { Prisma } from "@prisma/client";
import { activeDelegadorIds } from "@/lib/auth/delegacion";
import { assertCausaAccess, assertCausaCapability, causaAccessWhere } from "@/lib/auth/causa-access";
import { can } from "@/lib/auth/permissions";
import { httpError } from "@/lib/auth/access";
import { taskMutationPermissions, updateTasks } from "@/lib/tasks/service";
import { taskWorkspaceAccessWhere, taskWorkspaceCauseMatch } from "@/lib/tasks/workspace";
import { writeAuditStrict } from "@/lib/audit";
import { checkConflicts } from "@/lib/conflict";
import { causeReference, referenceConflict, taskReferenceContext, userReference, type Actor } from "./references";
import type { OfflineSyncInput } from "./schemas";

export type RelationAuthority = {
  taskSource?: { assigneeId: string | null; creatorId: string | null };
  cases: Array<{ id: string; write: boolean }>;
  responsible?: { id: string | null; changed: boolean };
  linkedTasks?: string[];
  resources: Array<{ type: "cause" | "user"; id: string }>;
};
export async function snapshotRelations(kind: "cliente" | "task", id: string, actor: Actor, tx: Prisma.TransactionClient) {
  const self = await userReference(actor.id, tx);
  if (kind === "cliente") {
    const row = await tx.cliente.findUniqueOrThrow({ where: { id } });
    const cases = await tx.causa.findMany({ where: { AND: [{ clienteId: id }, causaAccessWhere(actor)] }, orderBy: { id: "asc" }, take: 31, select: { id: true } });
    const linked = [];
    for (const c of cases.slice(0, 30)) linked.push(await causeReference(c.id, actor, tx));
    return { responsible: row.abogadoId ? await optionalUser(row.abogadoId, tx) : null, cases: linked, moreCases: cases.length > 30, self, canAssignOthers: true };
  }
  const row = await tx.task.findUniqueOrThrow({ where: { id } }), context = await taskReferenceContext(row, actor, tx);
  const delegates = await activeDelegadorIds(actor.id, "task.assign", tx), permissions = taskMutationPermissions(actor, row, delegates);
  return { responsible: row.assigneeId ? await optionalUser(row.assigneeId, tx) : null, cause: context.cause,
    causeLocked: context.locked, contextVersion: context.version, self, canAssignOthers: permissions.assignOthers, canEdit: permissions.edit };
}
async function optionalUser(id: string, tx: Prisma.TransactionClient) {
  try { return await userReference(id, tx); } catch (error) { if (![403, 404].includes((error as { status?: number }).status || 0)) throw error; return { id, label: "Responsable no disponible", version: null }; }
}
export async function prepareRelations(input: OfflineSyncInput, actor: Actor, tx: Prisma.TransactionClient) {
  const authority: RelationAuthority = { cases: [], resources: [] };
  const taskChanges: { assigneeId?: string | null; causaId?: string | null; clienteId?: string | null } = {};
  let abogadoId: string | null | undefined;
  if (!input.relations) return { authority: undefined, taskChanges, abogadoId };
  const r = input.relations;
  const before = input.action === "update" && input.kind === "task" ? await tx.task.findUniqueOrThrow({ where: { id: input.entityId! } }) : null;
  if (before) {
    const context = await taskReferenceContext(before, actor, tx);
    if (!('contextVersion' in r) || r.contextVersion !== context.version) throw referenceConflict("El contexto de la tarea cambió. Revise sus referencias antes de sincronizar.");
    authority.taskSource = { assigneeId: before.assigneeId, creatorId: before.creatorId };
    authority.cases = context.causes.map(c => ({ id: c.id, write: false }));
  }
  if (before && !r.responsible) authority.responsible = { id: before.assigneeId, changed: false };
  if (r.responsible) {
    const target = r.responsible;
    if (target.id) {
      const ref = await userReference(target.id, tx);
      if (ref.version !== target.expectedVersion) throw referenceConflict("La ficha del responsable cambió. Vuelva a revisarla antes de asignar.");
      authority.resources.push({ type: "user", id: target.id });
    }
    authority.responsible = { id: target.id, changed: !before || before.assigneeId !== target.id };
    if (input.kind === "cliente") abogadoId = target.id;
    else taskChanges.assigneeId = target.id;
  }
  if (input.kind === "task" && input.relations?.cause) {
    const change = input.relations.cause;
    if (before) {
      const context = await taskReferenceContext(before, actor, tx);
      if (context.locked) throw referenceConflict("La causa está fijada por el origen, espacio o jerarquía de la tarea. Conserve ese vínculo.");
      if (before.causaId) {
        if (change.previous?.id !== before.causaId) throw referenceConflict("Falta la referencia de la causa anterior");
        const previous = await causeReference(before.causaId, actor, tx, true);
        if (previous.version !== change.previous.expectedVersion) throw referenceConflict();
        authority.cases.push({ id: previous.id, write: true }); authority.resources.push({ type: "cause", id: previous.id });
      } else if (change.previous) throw referenceConflict("La causa de partida no corresponde a esta tarea");
    } else if (change.previous) throw httpError("Una tarea nueva no tiene una causa anterior", 400);
    if (change.id) {
      const target = await causeReference(change.id, actor, tx, true);
      if (target.version !== change.expectedVersion) throw referenceConflict();
      taskChanges.causaId = target.id; if (before?.clienteId) taskChanges.clienteId = target.clientId;
      authority.cases.push({ id: target.id, write: true }); authority.resources.push({ type: "cause", id: target.id });
    } else { taskChanges.causaId = null; taskChanges.clienteId = null; }
  }
  if (input.kind === "cliente") for (const change of input.relations?.caseLinks || []) {
    const ref = await causeReference(change.id, actor, tx, true);
    if (ref.version !== change.expectedVersion) throw referenceConflict();
    if (!change.link && (input.action === "create" || ref.clientId !== input.entityId)) throw referenceConflict("La causa ya no pertenece a este cliente");
    const bindings = await clientBindingTasks(change.id, change.link && input.action === "update" ? input.entityId! : null, actor, tx);
    authority.linkedTasks = [...new Set([...(authority.linkedTasks || []), ...bindings])];
    if (authority.linkedTasks.length > 100) throw referenceConflict("La selección afecta a más de 100 vínculos de tareas. Reduzca las causas de esta petición.");
    authority.cases.push({ id: change.id, write: true }); authority.resources.push({ type: "cause", id: change.id });
  }
  if (input.kind === "task") {
    const targetId = taskChanges.assigneeId === undefined ? before?.assigneeId ?? actor.id : taskChanges.assigneeId;
    if (before && taskChanges.assigneeId !== undefined && taskChanges.assigneeId !== before.assigneeId) {
      const permissions = taskMutationPermissions(actor, before, await activeDelegadorIds(actor.id, "task.assign", tx));
      if (taskChanges.assigneeId !== actor.id && !permissions.assignOthers) throw httpError("No puede reasignar esta tarea", 403);
      if (targetId && !await tx.task.findFirst({ where: { id: before.id, ...taskWorkspaceAccessWhere(await tx.user.findUniqueOrThrow({ where: { id: targetId } })) }, select: { id: true } })) throw httpError("El responsable no tiene acceso a la tarea de partida", 403);
    } else if (!before && targetId && targetId !== actor.id && !can(actor, "task.assign")) throw httpError("No puede asignar tareas a otros", 403);
    if (taskChanges.causaId && targetId) await assertCausaAccess(taskChanges.causaId, await tx.user.findUniqueOrThrow({ where: { id: targetId } }), { auditOverride: false }, tx);
  }
  return { authority, taskChanges, abogadoId };
}
export async function applyClientCaseLinks(input: OfflineSyncInput, clienteId: string, actor: Actor, tx: Prisma.TransactionClient) {
  if (input.kind !== "cliente") return;
  for (const change of input.relations?.caseLinks || []) {
    const before = await tx.causa.findUniqueOrThrow({ where: { id: change.id }, select: { clienteId: true, partes: { select: { nombre: true, rut: true } } } });
    await tx.causa.update({ where: { id: change.id }, data: { clienteId: change.link ? clienteId : null } });
    const bindings = await clientBindingTasks(change.id, change.link ? clienteId : null, actor, tx);
    if (bindings.length) await updateTasks(actor, bindings, { clienteId: change.link ? clienteId : null }, undefined, tx);
    const risk = await checkConflicts({ user: actor, partes: before.partes, excludeCausaId: change.id, client: tx });
    await tx.causa.update({ where: { id: change.id }, data: { conflictCheckedAt: new Date(), conflictStatus: risk.status } });
    await writeAuditStrict({ actorId: actor.id, action: "causa.cliente.link", entityType: "Causa", entityId: change.id,
      before: { clienteId: before.clienteId }, after: { clienteId: change.link ? clienteId : null, conflictStatus: risk.status } }, tx);
  }
}
export async function authorizeRelations(kind: "cliente" | "task", id: string, authority: RelationAuthority, actor: Actor, tx: Prisma.TransactionClient) {
  for (const c of authority.cases) {
    if (c.write) await assertCausaCapability(c.id, actor, "causa.write", tx);
    else await assertCausaAccess(c.id, actor, { auditOverride: false }, tx);
  }
  if (authority.linkedTasks?.length) {
    const delegates = await activeDelegadorIds(actor.id, "task.assign", tx);
    const rows = await tx.task.findMany({ where: { AND: [{ id: { in: authority.linkedTasks } }, taskWorkspaceAccessWhere(actor)] } });
    if (rows.length !== authority.linkedTasks.length || rows.some(t => !taskMutationPermissions(actor, t, delegates).edit)) throw httpError("Ya no puede modificar los vínculos de tareas de esta operación", 403);
  }
  if (authority.responsible?.id) {
    await userReference(authority.responsible.id, tx);
    if (kind === "task" && !await tx.task.findFirst({ where: { id, ...taskWorkspaceAccessWhere(await tx.user.findUniqueOrThrow({ where: { id: authority.responsible.id } })) }, select: { id: true } })) throw httpError("El responsable ya no tiene acceso a esta tarea", 403);
  }
  if (kind === "task") {
    if (authority.taskSource) {
      const permissions = taskMutationPermissions(actor, authority.taskSource, await activeDelegadorIds(actor.id, "task.assign", tx));
      if (!permissions.edit || authority.responsible?.changed && authority.responsible.id !== actor.id && !permissions.assignOthers) throw httpError("El permiso o la delegación para esta asignación ya no está vigente", 403);
    } else if (authority.responsible?.id && authority.responsible.id !== actor.id && !can(actor, "task.assign")) throw httpError("No puede asignar tareas a otros", 403);
  }
}
export async function relatedSnapshots(authority: RelationAuthority | undefined, actor: Actor, tx: Prisma.TransactionClient) {
  const seen = new Set<string>(), result = [];
  for (const r of authority?.resources || []) {
    const key = r.type + ":" + r.id; if (seen.has(key)) continue; seen.add(key);
    result.push({ type: r.type, ...(r.type === "cause" ? await causeReference(r.id, actor, tx) : await userReference(r.id, tx)) });
  }
  return result.sort((a, b) => (a.type + a.id).localeCompare(b.type + b.id));
}

async function clientBindingTasks(causaId: string, target: string | null, actor: Actor, tx: Prisma.TransactionClient) {
  const rows = await tx.task.findMany({ where: { AND: [taskWorkspaceCauseMatch(causaId), target ? { clienteId: { not: target } } : { clienteId: { not: null } }] }, take: 101 });
  if (rows.length > 100) throw referenceConflict("La causa requiere revisar más de 100 vínculos de tareas. Prepare este cambio en una operación específica con conexión.");
  const delegates = await activeDelegadorIds(actor.id, "task.assign", tx);
  for (const row of rows) {
    if (!await tx.task.findFirst({ where: { id: row.id, ...taskWorkspaceAccessWhere(actor) }, select: { id: true } }) || !taskMutationPermissions(actor, row, delegates).edit) throw httpError("No puede modificar todos los vínculos actuales de esta causa", 403);
  }
  return rows.map(t => t.id);
}
