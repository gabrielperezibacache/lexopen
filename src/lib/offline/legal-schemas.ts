import { z } from "zod";
import { causaCreateSchema } from "@/lib/schemas";
const id = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
const version = z.string().regex(/^[a-f0-9]{64}$/);
const validCivil = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.parse(s)) && new Date(s).toISOString().slice(0, 10) === s;
const date = z.string().refine(s => validCivil(s.slice(0, 10)) && (s.length === 10 || /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:\d{2})$/.test(s) && !Number.isNaN(Date.parse(s))), "Indique una fecha válida");
export const legalCauseFields = causaCreateSchema.omit({ clienteId: true, abogadoId: true, conflictOverride: true, conflictNotes: true }).extend({
  titulo: z.string().trim().min(3).max(500), tribunal: z.string().trim().min(2).max(300), materia: z.string().trim().min(2).max(120),
  partes: causaCreateSchema.shape.partes.unwrap().max(50), fechaNotificacion: date.nullable(),
}).strict();
export const legalDeadlineFields = z.object({
  titulo: z.string().trim().min(2).max(300), descripcion: z.string().max(20000).nullable(), fechaLimite: date,
  fechaNotificacion: date.nullable(), tipoComputo: z.enum(["habiles", "corridos"]), esFatal: z.boolean(),
  tipo: z.string().min(1).max(80), estado: z.enum(["pendiente", "cumplido", "vencido", "suspendido"]),
}).strict();
const reference = z.object({ id, expectedVersion: version }).strict();
const identity = { requestId: z.string().uuid(), entityId: id.optional(), expectedVersion: version.optional(), action: z.enum(["create", "update"]) };
export const legalSyncSchema = z.discriminatedUnion("kind", [
  z.object({ ...identity, kind: z.literal("causa"), fields: legalCauseFields }).strict(),
  z.object({ ...identity, kind: z.literal("plazo"), fields: legalDeadlineFields, dateReviewed: z.boolean().optional(), relations: z.object({
    cause: z.object({ id: id.nullable(), expectedVersion: version.optional(), previous: reference.optional() }).strict().optional(),
    responsible: z.object({ id: id.nullable(), expectedVersion: version.optional() }).strict().optional(),
  }).strict().optional() }).strict(),
]).superRefine((v, ctx) => {
  if (v.action === "update" && (!v.entityId || !v.expectedVersion)) ctx.addIssue({ code: "custom", message: "La actualización requiere identidad y versión" });
  if (v.action === "create" && (v.entityId || v.expectedVersion)) ctx.addIssue({ code: "custom", message: "La creación no acepta identidad del servidor" });
});
export type LegalInput = z.infer<typeof legalSyncSchema>;
