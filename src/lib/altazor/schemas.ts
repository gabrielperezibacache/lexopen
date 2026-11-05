import { z } from "zod";
import { altazorSourceInputSchema } from "./resources";
export const altazorId = z.string().min(1).max(160).regex(/^[A-Za-z0-9_-]+$/);
export const altazorRequestId = z.string().min(8).max(100).regex(/^[A-Za-z0-9._:-]+$/);
export const createConversationSchema = z.object({ requestId: altazorRequestId, title: z.string().trim().min(1).max(160).default("Nueva conversación"), causaId: altazorId.nullable().default(null) }).strict();
export const patchConversationSchema = z.object({ expectedRevision: z.number().int().positive(), title: z.string().trim().min(1).max(160).optional(), status: z.enum(["active", "archived"]).optional() }).strict().refine(input => input.title !== undefined || input.status !== undefined, "Indique un cambio");
export const createTurnSchema = z.object({ requestId: altazorRequestId, expectedRevision: z.number().int().positive(), text: z.string().trim().min(1).max(8_000), attachmentIds: z.array(altazorId).max(5).default([]), sources: z.array(altazorSourceInputSchema).max(8).default([]), automaticSources: z.boolean().default(false), documentoId: altazorId.optional(), destinationKey: z.string().regex(/^[a-f0-9]{64}$/), allowRemote: z.boolean().default(false), useMemory: z.boolean().default(false) }).strict().refine(input => new Set(input.attachmentIds).size === input.attachmentIds.length, "Los adjuntos no deben repetirse");
export const confirmAltazorTurnSchema = z.object({ confirm: z.boolean() }).strict();
