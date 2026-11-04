import { z } from "zod";
export const writingId = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const writingRevision = z.number().int().min(1).max(2_000_000_000);
export const writingRequestId = z.string().min(10).max(120).regex(/^[a-zA-Z0-9-]+$/);
export const writingCreateSchema = z.object({ requestId: writingRequestId, title: z.string().trim().min(1).max(200), body: z.string().max(100_000).default("") }).strict();
export const writingSaveSchema = z.object({ requestId: writingRequestId, expectedRevision: writingRevision, title: z.string().trim().min(1).max(200), body: z.string().max(100_000) }).strict();
export const writingSourceInputSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("document"), fragmentId: writingId, versionId: writingId, quote: z.string().min(1).max(10_000) }).strict(),
  z.object({ kind: z.literal("fact"), factId: writingId, revision: writingRevision }).strict(),
  z.object({ kind: z.literal("note"), workspaceId: writingId, noteId: writingId, revision: writingRevision }).strict(),
  z.object({ kind: z.literal("book"), bookId: writingId, fragmentId: writingId, quote: z.string().min(1).max(10_000) }).strict(),
]);
export const writingAddSourceSchema = z.object({ requestId: writingRequestId, expectedRevision: writingRevision, source: writingSourceInputSchema }).strict();
export const writingRestoreSchema = z.object({ requestId: writingRequestId, expectedRevision: writingRevision, targetRevision: writingRevision }).strict();
