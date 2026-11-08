import { z } from "zod";
import { memoId, memoVersion, minuteFieldsSchema, noteFieldsSchema } from "@/lib/minutas/schemas";
const identity = { requestId: z.string().uuid(), entityId: memoId.optional(), expectedVersion: memoVersion.optional(), action: z.enum(["create", "update"]) };
const relations = z.object({ cause: z.object({ id: memoId, expectedVersion: memoVersion }).strict() }).strict();
export const memoSyncSchema = z.discriminatedUnion("kind", [
  z.object({ ...identity, kind: z.literal("nota"), fields: noteFieldsSchema, relations: relations.optional() }).strict(),
  z.object({ ...identity, kind: z.literal("minuta"), fields: minuteFieldsSchema, relations: relations.optional(), reviewedActions: z.array(memoId).max(50).optional() }).strict(),
]).superRefine((v, ctx) => {
  if (v.action === "update" && (!v.entityId || !v.expectedVersion)) ctx.addIssue({ code: "custom", message: "Indique identidad y versión para actualizar" });
  if (v.action === "create" && (v.entityId || v.expectedVersion || !v.relations)) ctx.addIssue({ code: "custom", message: "La creación necesita una causa preparada y ninguna identidad de servidor" });
});
export type MemoInput = z.infer<typeof memoSyncSchema>;
