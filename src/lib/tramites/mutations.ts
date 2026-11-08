import type { Prisma } from "@prisma/client";
import { currentStaffActor, type StaffActor, type ResolvedStaffActor } from "@/lib/auth/staff-actor";
import { assertCausaAccess, assertCausaCapability, requiredCausaWhere } from "@/lib/auth/causa-access";
import { activeDelegadorIds } from "@/lib/auth/delegacion";
import { isStaff } from "@/lib/auth/rbac";
import { can } from "@/lib/auth/permissions";
import { httpError } from "@/lib/auth/access";
import { writeAuditStrict } from "@/lib/audit";
import { hashReference } from "@/lib/offline/references";
import { taskWorkspaceAccessWhere } from "@/lib/tasks/workspace";
import { taskMutationPermissions } from "@/lib/tasks/service";
import { syncTaskFromTramite } from "@/lib/tasks/sync-mirrors";
import { applyTaskCompletionEffects } from "@/lib/tasks/completion";
import { emitNotification } from "@/lib/notify/emit";
import { parseDateInput } from "@/lib/date-input";
import { z } from "zod";
type Tx = Prisma.TransactionClient;
const date = z.string().max(80).refine(s => Boolean(parseDateInput(s)), "Fecha inválida");
const text = (max: number) => z.string().max(max).refine(s => !s.includes("\0"), "El texto contiene un carácter nulo");
export const tramiteFields = z.object({ titulo: text(300).trim().min(2), detalle: text(10000).nullable(), estado: z.enum(["pendiente", "en_curso", "hecho", "cancelado"]), fechaLimite: date.nullable(), orden: z.number().int().min(0).max(1000000) }).strict();
export type TramiteFields = z.infer<typeof tramiteFields>;
export async function loadTramite(id: string, actor: ResolvedStaffActor, tx: Tx) {
    const row = await tx.tramite.findFirst({ where: { id, ...requiredCausaWhere(actor) }, include: { task: true } });
    if (!row)
        throw httpError("Trámite no disponible", 404);
    if (row.task && !await tx.task.findFirst({ where: { id: row.task.id, ...taskWorkspaceAccessWhere(actor) }, select: { id: true } }))
        throw httpError("Trámite no disponible", 404);
    const cause = await tx.causa.findUniqueOrThrow({ where: { id: row.causaId }, include: { miembros: { orderBy: { id: "asc" } } } });
    return { ...row, cause };
}
export type LoadedTramite = Awaited<ReturnType<typeof loadTramite>>;
export const tramiteVersion = (row: LoadedTramite) => hashReference(row);
export function fieldsOfTramite(row: LoadedTramite): TramiteFields { return { titulo: row.titulo, detalle: row.detalle, estado: row.estado as TramiteFields["estado"], fechaLimite: row.fechaLimite?.toISOString() || null, orden: row.orden }; }
export async function authorizeTramite(actor: ResolvedStaffActor, causaId: string, responsibleId: string | null, before: LoadedTramite | null, tx: Tx) {
    await assertCausaCapability(causaId, actor, "causa.write", tx);
    if (before?.task) {
        const delegates = await activeDelegadorIds(actor.id, "task.assign", tx);
        const permission = taskMutationPermissions(actor, before.task, delegates);
        if (!permission.edit)
            throw httpError("No puede modificar la tarea del trámite", 403);
        if (responsibleId !== before.task.assigneeId && responsibleId !== actor.id && !permission.assignOthers)
            throw httpError("Sin permiso para reasignar el trámite", 403);
        if (before.task.causaId && before.task.causaId !== causaId)
            throw httpError("La tarea tiene otra causa; revise su vínculo con conexión", 409);
    }
    else if (responsibleId && responsibleId !== actor.id && !can(actor, "task.assign", { own: true }))
        throw httpError("Sin permiso para asignar este trámite", 403);
    if (responsibleId) {
        const target = await tx.user.findUnique({ where: { id: responsibleId } });
        if (!target || !isStaff(target.role))
            throw httpError("Responsable no disponible", 403);
        await assertCausaAccess(causaId, target, { auditOverride: false }, tx);
        if (before?.task && !await tx.task.findFirst({ where: { id: before.task.id, ...taskWorkspaceAccessWhere(target) }, select: { id: true } }))
            throw httpError("El responsable no puede acceder al seguimiento", 403);
    }
}
export async function writeTramite(user: StaffActor, fields: TramiteFields, causaId: string, responsibleId: string | null, before: LoadedTramite | null, tx: Tx, explicitCompletion?: string | null) {
    const actor = await currentStaffActor(user, tx);
    fields = tramiteFields.parse(fields);
    await authorizeTramite(actor, causaId, responsibleId, before, tx);
    const done = fields.estado === "hecho";
    const completedAt = explicitCompletion !== undefined ? explicitCompletion ? parseDateInput(explicitCompletion) : null : done ? before?.fechaHecho || (before?.task?.status === "done" ? before.task.completedAt : null) || new Date() : null;
    if (explicitCompletion && (!completedAt || !done))
        throw httpError("La fecha de realización requiere un trámite hecho y una fecha válida", 422);
    const row = before ? await tx.tramite.update({ where: { id: before.id, updatedAt: before.updatedAt }, data: { ...fields, fechaLimite: fields.fechaLimite ? parseDateInput(fields.fechaLimite) : null, fechaHecho: completedAt, responsableId: responsibleId } })
        : await tx.tramite.create({ data: { ...fields, fechaLimite: fields.fechaLimite ? parseDateInput(fields.fechaLimite) : null, fechaHecho: completedAt, causaId, responsableId: responsibleId } });
    const status = ({ pendiente: "todo", en_curso: "in_progress", hecho: "done", cancelado: "cancelled" })[fields.estado];
    if (!before?.task) {
        const task = await syncTaskFromTramite(row.id, tx);
        if (!task)
            throw httpError("No se pudo crear el seguimiento del trámite", 500);
        await tx.task.update({ where: { id: task.id }, data: { creatorId: actor.id, completedById: done ? actor.id : null } });
        await tx.taskHistorial.create({ data: { taskId: task.id, campo: "creada", despues: task.status, actorId: actor.id } });
        await writeAuditStrict({ actorId: actor.id, action: "task.create", entityType: "Task", entityId: task.id, after: { source: "tramite", tramiteId: row.id } }, tx);
    }
    else {
        const old = before.task, changedState = before.estado !== fields.estado;
        const data: Prisma.TaskUpdateInput = {
            ...(before.titulo !== fields.titulo ? { title: fields.titulo } : {}), ...(before.detalle !== fields.detalle ? { description: fields.detalle } : {}),
            ...(before.fechaLimite?.getTime() !== row.fechaLimite?.getTime() ? { dueDate: row.fechaLimite } : {}), ...(before.responsableId !== responsibleId ? { assignee: responsibleId ? { connect: { id: responsibleId } } : { disconnect: true } } : {}),
            ...(changedState ? { status, completedAt: done ? old.completedAt || completedAt : null, completedBy: done ? { connect: { id: actor.id } } : { disconnect: true } } : {}),
            ...(explicitCompletion !== undefined && done ? { completedAt } : {}),
        };
        if (Object.keys(data).length) {
            const task = await tx.task.update({ where: { id: old.id, updatedAt: old.updatedAt }, data });
            await tx.taskHistorial.create({ data: { taskId: task.id, campo: "tramite", antes: JSON.stringify({ status: old.status }), despues: JSON.stringify({ status: task.status, tramiteId: row.id }), actorId: actor.id } });
            await writeAuditStrict({ actorId: actor.id, action: "task.update", entityType: "Task", entityId: task.id, after: { source: "tramite", tramiteId: row.id } }, tx);
            if (task.status === "done" && old.status !== "done")
                await applyTaskCompletionEffects(task, actor.id, tx);
        }
    }
    const cause = before?.cause || await tx.causa.findUniqueOrThrow({ where: { id: causaId }, select: { titulo: true, rit: true, clienteId: true } });
    if (responsibleId && responsibleId !== actor.id && (!before || before.responsableId !== responsibleId))
        await emitNotification({ tipo: "tramite.asignado", userId: responsibleId, title: `Trámite asignado · ${cause.rit || cause.titulo}`, body: row.titulo, href: cause.clienteId ? `/clientes/${cause.clienteId}` : `/causas/${causaId}#tramites`, entityType: "tramite", entityId: row.id, dedupeKey: `tramite:${row.id}:${row.updatedAt.toISOString()}:${responsibleId}` }, tx);
    if (!before || before.estado !== fields.estado)
        await tx.activity.create({ data: { tipo: "tramite", mensaje: before ? `Trámite «${row.titulo}» → ${row.estado}` : `Trámite creado: ${row.titulo}`, causaId, userId: actor.id } });
    await writeAuditStrict({ actorId: actor.id, action: before ? "tramite.update" : "tramite.create", entityType: "Tramite", entityId: row.id, before: before ? fieldsOfTramite(before) : undefined, after: { ...fields, responsableId: responsibleId } }, tx);
    return loadTramite(row.id, actor, tx);
}
