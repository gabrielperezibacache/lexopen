import { z } from "zod";
export const hearingId = z.string().min(1).max(100).regex(/^[a-zA-Z0-9_-]+$/);
export const hearingRevision = z.number().int().min(1).max(2_000_000_000);
export const hearingLocationSchema = z.object({ versionId: hearingId.optional(), page: z.number().int().min(1).max(500).optional(), after: z.number().int().min(0).max(1_000_000).optional() }).strict();
export const hearingCreateSchema = z.object({ title: z.string().trim().min(3).max(180), scheduledFor: z.string().datetime().nullable().optional() }).strict();
export const hearingPatchSchema = z.object({ revision: hearingRevision, title: z.string().trim().min(3).max(180), scheduledFor: z.string().datetime().nullable(), status: z.enum(["preparation", "live", "closed"]), agendaText: z.string().max(20_000) }).strict();
export const hearingSourceSchema = z.object({ kind: z.enum(["document", "site_file", "book", "legal"]), refId: hearingId }).strict();
export const hearingSourcePatchSchema = z.object({ revision: hearingRevision, state: z.enum(["pending", "reading", "reviewed"]), position: z.number().int().min(0).max(200), location: hearingLocationSchema }).strict();
export const hearingDeleteSchema = z.object({ revision: hearingRevision }).strict();
export const hearingQuoteSchema = z.object({ sourceId: hearingId, fragmentId: hearingId, quote: z.string().min(1).max(2200) }).strict();
export const hearingNoteSchema = z.object({ title: z.string().trim().min(1).max(180), body: z.string().trim().min(1).max(20_000), citation: hearingQuoteSchema.nullable().default(null) }).strict();
export const hearingNotePatchSchema = hearingNoteSchema.extend({ revision: hearingRevision }).strict();
export const hearingChatSchema = z.object({ requestId: z.string().min(10).max(120).regex(/^[a-zA-Z0-9-]+$/), question: z.string().trim().min(3).max(4000), mode: z.enum(["extractive", "ai"]), passages: z.array(hearingQuoteSchema).max(8), noteIds: z.array(hearingId).max(8).default([]) }).strict();
export const hearingVerifySchema = z.union([z.object({ citation: hearingQuoteSchema }).strict(), z.object({ noteId: hearingId }).strict(), z.object({ turnId: hearingId }).strict()]);
export const hearingBriefSchema = z.object({
  notes: z.array(z.object({ id: hearingId, revision: hearingRevision }).strict()).min(1).max(20)
    .refine(notes => new Set(notes.map(note => note.id)).size === notes.length, "Seleccione cada nota una sola vez"),
  opening: z.string().trim().max(8000).default(""),
  closing: z.string().trim().max(8000).default(""),
}).strict();
export type HearingBriefInput = z.infer<typeof hearingBriefSchema>;
export const hearingReadQuerySchema = z.object({ versionId: hearingId.optional(), page: z.coerce.number().int().min(1).max(500).optional(), after: z.coerce.number().int().min(0).max(1_000_000).optional() }).strict();
