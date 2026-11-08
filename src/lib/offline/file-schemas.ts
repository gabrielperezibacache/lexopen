import { z } from "zod";
export const MAX_OFFLINE_FILE_BYTES = 8 * 1024 * 1024;
export const MAX_OFFLINE_FILE_REQUEST_BYTES = 12 * 1024 * 1024;
export const fileId = z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/);
export const fileVersion = z.string().regex(/^[a-f0-9]{64}$/);
export const fileKind = z.enum(["documento", "adjunto"]);
const noNull = (s: string) => !s.includes("\0");
export const fileFields = z.object({ name: z.string().trim().min(1).max(255).refine(s => !/[\x00-\x1f/\\]/.test(s), "Use un nombre sin carpetas"), type: z.string().trim().min(1).max(80).refine(noNull, "El tipo contiene un carácter nulo"), path: z.string().max(1000).nullable(), tags: z.string().max(1000).refine(noNull, "Las etiquetas contienen un carácter nulo"), confidential: z.boolean(), privileged: z.boolean() }).strict();
export const fileContent = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("text"), text: z.string().max(1024 * 1024).refine(noNull, "Conserve este contenido como adjunto binario"), mimeType: z.string().max(150), sha256: fileVersion }).strict(),
  z.object({ mode: z.literal("binary"), base64: z.string().max(Math.ceil(MAX_OFFLINE_FILE_BYTES / 3) * 4), size: z.number().int().min(0).max(MAX_OFFLINE_FILE_BYTES), mimeType: z.string().max(150), sha256: fileVersion }).strict(),
]);
export const fileTargetInput = z.object({ type: z.enum(["cause", "site"]), id: fileId, folderId: fileId.nullable().default(null), expectedVersion: fileVersion }).strict();
export const fileSyncSchema = z.object({ requestId: z.string().uuid(), kind: fileKind, action: z.enum(["create", "update"]), entityId: fileId.optional(), expectedVersion: fileVersion.optional(), fields: fileFields, content: fileContent, target: fileTargetInput.optional() }).strict().superRefine((v, ctx) => {
  if (v.action === "update" && (!v.entityId || !v.expectedVersion || v.target)) ctx.addIssue({ code: "custom", message: "La actualización conserva su origen y necesita identidad y versión" });
  if (v.action === "create" && (v.entityId || v.expectedVersion || !v.target || (v.kind === "documento" ? v.target.type !== "cause" || v.target.folderId : v.target.type !== "site"))) ctx.addIssue({ code: "custom", message: "Prepare un destino válido para el archivo nuevo" });
});
export type FileInput = z.infer<typeof fileSyncSchema>;
export type FileFields = z.infer<typeof fileFields>;
export type FileContent = z.infer<typeof fileContent>;
export type FileKind = z.infer<typeof fileKind>;
