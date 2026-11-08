import { memoSyncSchema } from "./memo-schemas";
import { operationsSyncSchema } from "./operations-schemas";
import { legalSyncSchema } from "./legal-schemas";
import { z } from "zod";
import { clienteCreateSchema } from "@/lib/schemas";
import { taskChangesSchema } from "@/lib/tasks/service";
export const offlineKind = z.enum(["cliente", "task", "causa", "plazo", "nota", "minuta", "evento", "tramite"]);
export const offlineVersion = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const reference = z.object({ id, expectedVersion: offlineVersion }).strict();
const responsible = z.object({ id: id.nullable(), expectedVersion: offlineVersion.optional() }).strict().refine(v => !v.id || Boolean(v.expectedVersion), "Prepare primero la ficha del responsable");
const causeChange = z.object({ id: id.nullable(), expectedVersion: offlineVersion.optional(), previous: reference.optional() }).strict().refine(v => !v.id || Boolean(v.expectedVersion), "Prepare primero la causa");
const clientRelations = z.object({ responsible: responsible.optional(), caseLinks: z.array(reference.extend({ link: z.boolean() })).max(20).optional() }).strict().refine(v => !v.caseLinks || new Set(v.caseLinks.map(c => c.id)).size === v.caseLinks.length, "Cada causa admite un solo cambio por petición");
const taskRelations = z.object({ responsible: responsible.optional(), cause: causeChange.optional(), contextVersion: offlineVersion.optional() }).strict();
export const offlineClienteFields = clienteCreateSchema.omit({ abogadoId: true }).extend({ razonSocial: z.string().trim().min(2).max(300) }).strict();
export const offlineTaskFields = taskChangesSchema.pick({ title: true, description: true, instructions: true, considerations: true, status: true, priority: true, dueDate: true, remindAt: true, waitingOn: true }).extend({ title: z.string().trim().min(1).max(300) }).strict();
const identity = { requestId: z.string().uuid(), entityId: id.optional(), expectedVersion: offlineVersion.optional(), action: z.enum(["create", "update"]) };
const recordSyncSchema = z.discriminatedUnion("kind", [
  z.object({ ...identity, kind: z.literal("cliente"), fields: offlineClienteFields, relations: clientRelations.optional() }).strict(),
  z.object({ ...identity, kind: z.literal("task"), fields: offlineTaskFields, relations: taskRelations.optional() }).strict(),
]).superRefine((value, ctx) => {
  if (value.action === "update" && (!value.entityId || !value.expectedVersion)) ctx.addIssue({ code: "custom", message: "La actualización requiere identidad y versión de partida" });
  if (value.action === "create" && (value.entityId || value.expectedVersion)) ctx.addIssue({ code: "custom", message: "La creación no acepta una identidad del servidor" });
});
export const offlineSyncSchema = z.union([recordSyncSchema, legalSyncSchema, memoSyncSchema, operationsSyncSchema]);
export type OfflineSyncInput = z.input<typeof recordSyncSchema>;
