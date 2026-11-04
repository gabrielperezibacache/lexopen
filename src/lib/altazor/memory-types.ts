import { z } from "zod";

export const MEMORY_LIMITS = { nodes: 100, edges: 150, supports: 3, contextNodes: 6, contextEdges: 6, contextChars: 6000 } as const;
export const memoryId = z.string().min(1).max(120).regex(/^[A-Za-z0-9_-]+$/);
export const memoryScopeSchema = z.object({ causaId: memoryId.nullable().optional() }).strict();
export const memorySupportInput = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("manual") }).strict(),
  z.object({ kind: z.literal("book"), bookId: memoryId, fragmentId: memoryId, quote: z.string().trim().min(1).max(3000) }).strict(),
  z.object({ kind: z.literal("evidence"), sourceKind: z.enum(["document", "legal"]), fragmentId: memoryId, versionId: memoryId, quote: z.string().trim().min(1).max(3000) }).strict(),
]);
const content = { label: z.string().trim().min(2).max(160), body: z.string().trim().max(2000).default("") };
export const createMemoryNodeSchema = z.object({ ...content, causaId: memoryId.nullable().optional(), requestId: memoryId.min(8), expectedEpoch: z.number().int().positive(), kind: z.enum(["preference", "concept", "claim"]), supports: z.array(memorySupportInput).min(1).max(MEMORY_LIMITS.supports) }).strict();
export const createMemoryEdgeSchema = z.object({ causaId: memoryId.nullable().optional(), requestId: memoryId.min(8), expectedEpoch: z.number().int().positive(), fromId: memoryId, toId: memoryId, relation: z.string().trim().min(2).max(100), body: content.body, supports: z.array(memorySupportInput).min(1).max(MEMORY_LIMITS.supports) }).strict().refine(value => value.fromId !== value.toId, { message: "Elija dos recuerdos distintos", path: ["toId"] });
export const updateMemorySchema = z.object({ causaId: memoryId.nullable().optional(), requestId: memoryId.min(8), target: z.enum(["node", "edge"]), expectedRevision: z.number().int().positive(), action: z.enum(["confirm", "reject", "forget", "edit"]), label: content.label.optional(), body: content.body.optional() }).strict();
export type MemorySupportInput = z.infer<typeof memorySupportInput>;
export type AltazorMemoryDependency = { kind: "altazor_memory"; target: "node" | "edge"; id: string; revision: number; spaceId: string; epoch: number; supports: { id: string; sha256: string }[] };
export type MemorySupportView = { kind: "manual" | "book" | "evidence"; title: string; href: string | null; quote: string; notice: string };
export type MemoryNodeView = { id: string; kind: string; label: string; body: string; status: "proposed" | "confirmed"; revision: number; supports: MemorySupportView[] };
export type MemoryEdgeView = { id: string; fromId: string; toId: string; relation: string; body: string; status: "proposed" | "confirmed"; revision: number; supports: MemorySupportView[] };
export type AltazorMemoryView = { scope: "personal" | "causa"; causaId: string | null; epoch: number; nodes: MemoryNodeView[]; edges: MemoryEdgeView[]; unavailable: { id: string; target: "node" | "edge"; revision: number }[]; limited: boolean; notice: string };
export function memoryScopeKey(causaId?: string | null) { return causaId ? `causa:${memoryId.parse(causaId)}` : "personal"; }
export function memorySearchText(value: string) { return value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("es"); }
export function rankMemory<T extends { label: string; body: string }>(rows: T[], query: string) {
  const terms = [...new Set(memorySearchText(query).match(/[\p{L}\p{N}]{3,}/gu) || [])].slice(0, 16);
  if (!terms.length) return [];
  return rows.map((row, index) => ({ row, index, score: terms.reduce((score, term) => score + Number(memorySearchText(row.label).includes(term)) * 3 + Number(memorySearchText(row.body).includes(term)), 0) })).filter(value => value.score > 0).sort((a, b) => b.score - a.score || a.index - b.index).map(value => value.row);
}
