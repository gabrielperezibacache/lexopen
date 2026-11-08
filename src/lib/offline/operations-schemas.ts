import { z } from "zod";
import { eventoUpdateSchema } from "@/lib/calendario/event-input";
import { tramiteFields } from "@/lib/tramites/mutations";
import { isValidYmd } from "@/lib/chile-time";
const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/), version = z.string().regex(/^[a-f0-9]{64}$/);
const instant = z.string().datetime({ offset: true }).refine(s => isValidYmd(s.slice(0, 10)), "Fecha inválida");
export const offlineEventFields = eventoUpdateSchema.pick({ titulo: true, tipo: true, inicio: true, fin: true, todoElDia: true, lugar: true, modalidad: true, enlace: true, notas: true, tipoAudiencia: true, tribunal: true, estado: true }).required().extend({ inicio: instant, fin: instant.nullable(), enlace: z.string().max(2000).url().refine(s => /^https?:\/\//i.test(s), "Use un enlace HTTP o HTTPS").nullable() }).strict().superRefine((v, ctx) => {
    if (v.fin && Date.parse(v.fin) <= Date.parse(v.inicio))
        ctx.addIssue({ code: "custom", message: "El fin debe ser posterior al inicio" });
    if (v.todoElDia && (!v.fin || !v.inicio.endsWith("T00:00:00.000Z") || !v.fin.endsWith("T00:00:00.000Z")))
        ctx.addIssue({ code: "custom", message: "Los días completos requieren inicio civil y fin exclusivo" });
});
const ref = z.object({ id, expectedVersion: version }).strict();
const relation = z.object({ cause: z.object({ id: id.nullable(), expectedVersion: version.optional(), previous: ref.optional() }).strict().optional(), responsible: z.object({ id: id.nullable(), expectedVersion: version.optional() }).strict().optional() }).strict();
const identity = { requestId: z.string().uuid(), action: z.enum(["create", "update"]), entityId: id.optional(), expectedVersion: version.optional(), dateReviewed: z.boolean().optional(), relations: relation.optional() };
export const operationsSyncSchema = z.discriminatedUnion("kind", [
    z.object({ ...identity, kind: z.literal("evento"), fields: offlineEventFields }).strict(),
    z.object({ ...identity, kind: z.literal("tramite"), fields: tramiteFields }).strict(),
]).superRefine((v, ctx) => {
    if (v.action === "update" && (!v.entityId || !v.expectedVersion))
        ctx.addIssue({ code: "custom", message: "Indique identidad y versión para actualizar" });
    if (v.action === "create" && (v.entityId || v.expectedVersion || v.kind === "tramite" && !v.relations?.cause?.id))
        ctx.addIssue({ code: "custom", message: "El trámite nuevo necesita una causa preparada y ninguna identidad previa" });
    for (const r of [v.relations?.cause, v.relations?.responsible])
        if (r?.id && !r.expectedVersion)
            ctx.addIssue({ code: "custom", message: "Prepare la versión del responsable o causa" });
});
export type OperationInput = z.infer<typeof operationsSyncSchema>;
