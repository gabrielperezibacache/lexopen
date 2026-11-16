import { z } from "zod";
const identity = {
  requestId: z.string().uuid(), entityId: z.string().regex(/^[\w-]{1,100}$/),
  expectedVersion: z.string().regex(/^[a-f0-9]{64}$/), action: z.literal("update"),
};
export const manuscriptFields = z.object({ title: z.string().min(1).max(240), body: z.string().max(100000) }).strict();
export const bookNoteFields = z.object({ title: z.string().trim().min(1).max(200), notes: z.string().max(20000), bookmarkKind: z.enum(["", "page", "fragment"]), bookmarkNumber: z.string().regex(/^\d{0,8}$/) }).strict();
export const personalSyncSchema = z.discriminatedUnion("kind", [
  z.object({ ...identity, kind: z.literal("academic"), fields: manuscriptFields }).strict(),
  z.object({ ...identity, kind: z.literal("booknote"), fields: bookNoteFields }).strict(),
]);
export type PersonalInput = z.infer<typeof personalSyncSchema>;
