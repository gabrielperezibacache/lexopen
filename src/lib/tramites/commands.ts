import { z } from "zod";
import { currentStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { assertCausaCapability } from "@/lib/auth/causa-access";
import { executeCommand, serializable } from "@/lib/command-execution";
import { httpError } from "@/lib/auth/access";
import { tramiteCreateSchema, tramiteUpdateSchema } from "@/lib/schemas";
import { findTemplate, fechaLimiteFromDias } from "@/lib/tramite-templates";
import { requireDeadlineComputation } from "@/lib/plazos-policy";
import { writeAuditStrict } from "@/lib/audit";
import { loadTramite, writeTramite, authorizeTramite, fieldsOfTramite } from "./mutations";
type Receipt = {
    ids: string[];
    causaId: string;
};
async function currentRows(user: StaffActor, ids: string[]) {
    return serializable(async (tx) => { const actor = await currentStaffActor(user, tx), rows = []; for (const id of ids) {
        const row = await loadTramite(id, actor, tx);
        const { task: _task, cause: _cause, ...data } = row;
        rows.push({ ...data, responsable: row.responsableId ? await tx.user.findUnique({ where: { id: row.responsableId }, select: { id: true, name: true } }) : null });
        void _task;
        void _cause;
    } return rows; });
}
export async function createTramiteCommand(user: StaffActor, causaId: string, raw: unknown, key: string) {
    const input = z.union([z.object({ action: z.literal("apply-template"), templateId: z.string().min(1).max(100) }).strict(), tramiteCreateSchema]).parse(raw);
    const receipt = await executeCommand<Receipt>({ key, ownerId: user.id, input: { causaId, input }, authorize: async (tx, previous) => { const actor = await currentStaffActor(user, tx); await assertCausaCapability(causaId, actor, "causa.write", tx); if (previous)
            for (const id of previous.ids) {
                const row = await loadTramite(id, actor, tx);
                await authorizeTramite(actor, row.causaId, row.responsableId, row, tx);
            } }, run: async (tx) => {
            const actor = await currentStaffActor(user, tx), max = await tx.tramite.aggregate({ where: { causaId }, _max: { orden: true } });
            let order = (max._max.orden ?? 0) + 1;
            const ids = [];
            if ("action" in input) {
                const template = findTemplate(input.templateId);
                if (!template)
                    throw httpError("Plantilla no encontrada", 404);
                if (template.items.some(i => i.diasLimite))
                    await requireDeadlineComputation(tx);
                for (const item of template.items) {
                    const row = await writeTramite(actor, { titulo: item.titulo, detalle: item.detalle || null, estado: "pendiente", fechaLimite: item.diasLimite ? fechaLimiteFromDias(item.diasLimite).toISOString() : null, orden: order++ }, causaId, actor.id, null, tx);
                    ids.push(row.id);
                }
                await writeAuditStrict({ actorId: actor.id, action: "tramite.apply-template", entityType: "Causa", entityId: causaId, after: { templateId: input.templateId, count: ids.length } }, tx);
            }
            else {
                const row = await writeTramite(actor, { titulo: input.titulo, detalle: input.detalle || null, estado: input.estado || "pendiente", fechaLimite: input.fechaLimite || null, orden: input.orden ?? order }, causaId, input.responsableId || actor.id, null, tx);
                ids.push(row.id);
            }
            return { ids, causaId };
        } });
    const rows = await currentRows(user, receipt.ids);
    return "action" in input ? { rows: rows.length, tramites: rows } : rows[0];
}
export async function updateTramiteCommand(user: StaffActor, id: string, raw: unknown, key: string) {
    const input = tramiteUpdateSchema.parse(raw);
    await executeCommand<Receipt>({ key, ownerId: user.id, input: { id, input }, authorize: async (tx) => { const actor = await currentStaffActor(user, tx), row = await loadTramite(id, actor, tx); await authorizeTramite(actor, row.causaId, row.responsableId, row, tx); }, run: async (tx) => {
            const actor = await currentStaffActor(user, tx), before = await loadTramite(id, actor, tx);
            if (input.expectedUpdatedAt && before.updatedAt.getTime() !== new Date(input.expectedUpdatedAt).getTime())
                throw httpError("El trámite cambió en otra sesión. Conserve sus datos y compare las versiones", 409);
            const base = fieldsOfTramite(before), fields = { ...base, ...Object.fromEntries(Object.entries(input).filter(([k]) => Object.hasOwn(base, k))) };
            const row = await writeTramite(actor, fields, before.causaId, input.responsableId !== undefined ? input.responsableId : before.responsableId, before, tx, input.fechaHecho);
            return { ids: [row.id], causaId: row.causaId };
        } });
    return (await currentRows(user, [id]))[0];
}
export async function deleteTramiteCommand(user: StaffActor, id: string, key: string) {
    return executeCommand<Receipt>({ key, ownerId: user.id, input: { id }, authorize: async (tx, previous) => { const actor = await currentStaffActor(user, tx); if (previous)
            await assertCausaCapability(previous.causaId, actor, "causa.write", tx);
        else {
            const row = await loadTramite(id, actor, tx);
            await authorizeTramite(actor, row.causaId, row.responsableId, row, tx);
        } }, run: async (tx) => { const actor = await currentStaffActor(user, tx), row = await loadTramite(id, actor, tx); await tx.tramite.delete({ where: { id, updatedAt: row.updatedAt } }); await writeAuditStrict({ actorId: actor.id, action: "tramite.delete", entityType: "Tramite", entityId: id, before: fieldsOfTramite(row) }, tx); return { ids: [id], causaId: row.causaId }; } });
}
