import { currentStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { can } from "@/lib/auth/permissions";
import { httpError } from "@/lib/auth/access";
import { activeDelegadorIds } from "@/lib/auth/delegacion";
import { executeCommand, serializable, canonicalJson } from "@/lib/command-execution";
import { authorizeEventTarget, loadEvent, writeEventRecord } from "@/lib/calendario/commands";
import { detectEventConflicts, describeEventConflicts } from "@/lib/assistant/conflicts";
import { loadTramite, authorizeTramite, fieldsOfTramite, writeTramite } from "@/lib/tramites/mutations";
import { hashReference, causeReference, userReference, referenceConflict, type Actor } from "./references";
import type { OperationInput } from "./operations-schemas";
import type { Prisma } from "@prisma/client";
type Tx = Prisma.TransactionClient;
type Kind = "evento" | "tramite";
type Target = {
    responsableId: string | null;
    causaId: string | null;
};
type Authority = {
    kind: Kind;
    targets: Target[];
};
type Receipt = {
    kind: Kind;
    entityId: string;
    version: string;
    authority: Authority;
    referenceVersions: {
        type: string;
        id: string;
        version: string;
    }[];
};
type Rejected = {
    rejected: true;
    error: string;
    status: number;
};
const same = (a: unknown, b: unknown) => canonicalJson(a) === canonicalJson(b);
async function eventSource(id: string, actor: Actor, tx: Tx) { const row = await loadEvent(id, actor, tx); const cause = row.causaId ? await tx.causa.findUniqueOrThrow({ where: { id: row.causaId }, include: { miembros: { orderBy: { id: "asc" } } } }) : null; const tasks = await tx.task.findMany({ where: { eventoId: id }, orderBy: { id: "asc" }, select: { id: true, updatedAt: true, causaId: true, assigneeId: true } }); return { ...row, cause, tasks }; }
function eventFields(row: Awaited<ReturnType<typeof eventSource>>) { return { titulo: row.titulo, tipo: row.tipo, inicio: row.inicio.toISOString(), fin: row.fin?.toISOString() || null, todoElDia: row.todoElDia, lugar: row.lugar, modalidad: row.modalidad, enlace: row.enlace, notas: row.notas, tipoAudiencia: row.tipoAudiencia, tribunal: row.tribunal, estado: row.estado }; }
async function person(id: string | null, tx: Tx) { if (!id)
    return null; try {
    return await userReference(id, tx);
}
catch (e) {
    if ((e as {
        status?: number;
    }).status !== 403)
        throw e;
    return { id, label: "Responsable no disponible", version: "" };
} }
export async function readOperation(kind: Kind, id: string, actor: Actor, tx: Tx) {
    const self = await userReference(actor.id, tx);
    if (kind === "tramite") {
        const row = await loadTramite(id, actor, tx);
        let readOnly = false;
        try {
            await authorizeTramite(actor, row.causaId, row.responsableId, row, tx);
        }
        catch (e) {
            if (![403, 404, 409].includes((e as {
                status?: number;
            }).status || 0))
                throw e;
            readOnly = true;
        }
        return { kind, id, version: hashReference(row), fields: fieldsOfTramite(row), relations: { self, responsible: await person(row.responsableId, tx), cause: await causeReference(row.causaId, actor, tx), causeLocked: true, canAssignOthers: !readOnly, readOnly, completedAt: row.fechaHecho?.toISOString() || null } };
    }
    const row = await eventSource(id, actor, tx);
    let readOnly = Boolean(row.googleEventId);
    try {
        await authorizeEventTarget(actor, row, tx);
    }
    catch (e) {
        if (![403, 404].includes((e as {
            status?: number;
        }).status || 0))
            throw e;
        readOnly = true;
    }
    const conflicts = row.estado === "cancelado" ? [] : await detectEventConflicts(row.inicio, row.fin, row.responsableId, id, actor, tx);
    return { kind, id, version: hashReference(row), fields: eventFields(row), relations: { self, responsible: await person(row.responsableId, tx), cause: row.causaId ? await causeReference(row.causaId, actor, tx) : null, causeLocked: Boolean(row.googleEventId || row.tasks.length || row.clienteId), responsibleRequired: true, canAssignOthers: can(actor, "evento.manage") || (await activeDelegadorIds(actor.id, "evento.manage", tx)).length > 0, readOnly, warning: conflicts.length ? describeEventConflicts(conflicts) : null } };
}
async function authorize(authority: Authority, actor: Actor, tx: Tx, id?: string) {
    for (const t of authority.targets) {
        if (authority.kind === "evento") {
            if (!t.responsableId)
                throw httpError("Indique el responsable del evento", 422);
            await authorizeEventTarget(actor, { ...t, responsableId: t.responsableId }, tx);
        }
        else {
            const before = id ? await loadTramite(id, actor, tx) : null;
            await authorizeTramite(actor, t.causaId!, t.responsableId, before, tx);
        }
    }
}
async function references(authority: Authority, actor: Actor, tx: Tx) { const refs = []; for (const id of [...new Set(authority.targets.map(t => t.causaId).filter((v): v is string => Boolean(v)))].sort())
    refs.push({ type: "cause", ...await causeReference(id, actor, tx) }); for (const id of [...new Set(authority.targets.map(t => t.responsableId).filter((v): v is string => Boolean(v)))].sort())
    refs.push({ type: "user", ...await userReference(id, tx) }); return refs; }
export async function syncOperation(user: StaffActor, input: OperationInput) {
    const receipt = await executeCommand<Receipt | Rejected>({ key: `offline:${input.requestId}`, ownerId: user.id, input, authorize: async (tx, previous) => { const actor = await currentStaffActor(user, tx); if (previous && !("rejected" in previous)) {
            await readOperation(previous.kind, previous.entityId, actor, tx);
            await authorize(previous.authority, actor, tx, previous.entityId);
        } }, run: async (tx) => {
            const actor = await currentStaffActor(user, tx), before = input.action === "update" ? await readOperation(input.kind, input.entityId!, actor, tx) : null;
            if (before && before.version !== input.expectedVersion)
                throw httpError("El registro, su tarea o contexto cambió. Compare las copias antes de sincronizar", 409);
            const current = input.action === "update" ? (input.kind === "evento" ? await eventSource(input.entityId!, actor, tx) : await loadTramite(input.entityId!, actor, tx)) : null;
            const causeId = input.relations?.cause ? input.relations.cause.id : current?.causaId || null, responsibleId = input.relations?.responsible ? input.relations.responsible.id : current?.responsableId ?? actor.id;
            const targets: Target[] = [{ causaId: causeId, responsableId: responsibleId }];
            if (current)
                targets.unshift({ causaId: current.causaId, responsableId: current.responsableId });
            const authority: Authority = { kind: input.kind, targets };
            try {
                if (before?.relations.readOnly)
                    throw referenceConflict("La copia es de consulta o procede de Google. Revise la modificación con conexión");
                if (input.relations?.cause) {
                    const change = input.relations.cause;
                    if (current?.causaId) {
                        if (change.previous?.id !== current.causaId || change.previous.expectedVersion !== (await causeReference(current.causaId, actor, tx)).version)
                            throw referenceConflict("La causa de origen cambió");
                    }
                    else if (change.previous)
                        throw referenceConflict("La causa de origen no coincide");
                    if (change.id && change.expectedVersion !== (await causeReference(change.id, actor, tx, input.kind === "tramite")).version)
                        throw referenceConflict("El contexto de la causa preparada cambió");
                    if (before?.relations.causeLocked && change.id !== current?.causaId)
                        throw referenceConflict("Conserve la causa fijada por el origen");
                }
                if (input.kind === "tramite" && !causeId)
                    throw referenceConflict("Seleccione una causa preparada para el trámite");
                if (input.relations?.responsible?.id && input.relations.responsible.expectedVersion !== (await userReference(input.relations.responsible.id, tx)).version)
                    throw referenceConflict("El responsable cambió desde que se preparó");
                await authorize(authority, actor, tx, input.entityId);
            }
            catch (e) {
                if ((e as {
                    code?: string;
                }).code === "offline_reference_conflict" || [403, 404].includes((e as {
                    status?: number;
                }).status || 0))
                    return { rejected: true, error: (e as Error).message, status: (e as {
                            status?: number;
                        }).status || 409 };
                throw e;
            }
            let id: string;
            if (input.kind === "evento") {
                const old = current && "googleEventId" in current ? current : null;
                if ((!old || !same([input.fields.inicio, input.fields.fin, input.fields.todoElDia], [old.inicio.toISOString(), old.fin?.toISOString() || null, old.todoElDia])) && !input.dateReviewed)
                    throw httpError("Revise expresamente las fechas y horas del evento antes de sincronizar", 422);
                const row = await writeEventRecord(actor, { ...input.fields, responsableId: responsibleId!, causaId: causeId }, old, tx);
                id = row.id;
            }
            else {
                const old = current && "task" in current ? current : null;
                if (input.fields.fechaLimite && (!old || Date.parse(input.fields.fechaLimite) !== old.fechaLimite?.getTime()) && !input.dateReviewed)
                    throw httpError("Revise la fecha límite del trámite. No se calcula un vencimiento sin red", 422);
                id = (await writeTramite(actor, input.fields, causeId!, responsibleId, old, tx)).id;
            }
            const result = await readOperation(input.kind, id, actor, tx), refs = await references(authority, actor, tx);
            return { kind: input.kind, entityId: id, version: result.version, authority, referenceVersions: refs.map(({ type, id, version }) => ({ type, id, version })) };
        } });
    if ("rejected" in receipt)
        throw Object.assign(referenceConflict(receipt.error), { status: receipt.status });
    return serializable(async (tx) => { const actor = await currentStaffActor(user, tx); await authorize(receipt.authority, actor, tx, receipt.entityId); return { receipt, entity: await readOperation(receipt.kind, receipt.entityId, actor, tx), references: await references(receipt.authority, actor, tx) }; });
}
