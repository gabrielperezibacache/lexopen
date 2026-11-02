import { Prisma, type PrismaClient } from "@prisma/client";
import type { z } from "zod";
import { prisma } from "@/lib/db";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { httpError } from "@/lib/auth/access";
import { writeAuditStrict } from "@/lib/audit";
import { sha256 } from "@/lib/evidence/fragments";
import { captureWritingSource, verifyWritingSource } from "./sources";
import { writingAddSourceSchema, writingCreateSchema, writingRestoreSchema, writingSaveSchema } from "./schemas";
import { writingActor, writingChanged, writingMissing, writingTransaction, writingUnavailable, type WritingClient } from "./access";
import type { WritingChange, WritingDraftList, WritingDraftView, WritingHistory, WritingMutationResult, WritingReference, WritingReferenceView, WritingRevisionView } from "./types";

type DraftRow = Prisma.CaseWritingDraftGetPayload<Record<string, never>>;
type RevisionRow = Prisma.CaseWritingRevisionGetPayload<Record<string, never>>;
export const WRITING_LIMITS = { body: 100_000, references: 20, citations: 100, draftsPerOwnerCase: 200, listPage: 50, historyPage: 30 } as const;
const sourceUnavailable = (error: unknown) => {
  if (writingUnavailable(error)) return Object.assign(httpError("Una fuente incorporada ya no está disponible o no pudo corroborarse. Revise el acceso y el material conservado", 409), { code: "writing_source_unavailable" });
  return error;
};
function references(json: string): WritingReference[] {
  try {
    if (json.length > 2_000_000) throw new Error();
    const rows = JSON.parse(json) as WritingReference[];
    if (!Array.isArray(rows) || rows.length > WRITING_LIMITS.references || new Set(rows.map(row => row?.id)).size !== rows.length || rows.some(row => !row || !/^R[1-9][0-9]{0,9}$/.test(row.id) || !row.source || typeof row.source !== "object")) throw new Error();
    return rows;
  } catch { throw sourceUnavailable(httpError("Referencias guardadas inválidas", 409)); }
}
async function verifiedReferences(causaId: string, json: string, actor: CausaAccessUser, client: WritingClient, cache = new Map<string, unknown>()): Promise<WritingReferenceView[]> {
  const stored = references(json), verified: WritingReferenceView[] = [];
  let count = 0;
  try {
    for (const row of stored) {
      const source = await verifyWritingSource(causaId, row.source, actor, client, cache);
      count += source.citations.length;
      if (count > WRITING_LIMITS.citations) throw httpError("El escrito supera el presupuesto de cotejo de citas", 409);
      verified.push({ id: row.id, source });
    }
  } catch (error) { throw sourceUnavailable(error); }
  return verified;
}
function warnings(body: string, refs: WritingReferenceView[]) {
  const registered = new Set(refs.map(ref => ref.id));
  const markers = [...body.matchAll(/\[\^(R[1-9][0-9]*)\]/g)].map(match => match[1]);
  return [...new Set([
    "La corroboración comprueba pasajes y material conservado. El razonamiento, la pertinencia y la vigencia requieren revisión profesional.",
    ...(markers.some(marker => !registered.has(marker)) ? ["El texto contiene marcadores de referencia sin una fuente incorporada. Corríjalos antes de exportar."] : []),
    ...(refs.some(ref => !markers.includes(ref.id)) ? ["Hay fuentes incorporadas cuyo marcador no aparece en el texto. Se conservan en las referencias y el historial."] : []),
    ...refs.flatMap(ref => ref.source.warnings),
  ])];
}
async function rowFor(causaId: string, id: string, user: CausaAccessUser, client: WritingClient, write = false) {
  const access = await writingActor(causaId, user, client, write);
  const row = await client.caseWritingDraft.findFirst({ where: { id, causaId, ownerId: access.actor.id } });
  if (!row) throw writingMissing();
  return { ...access, row };
}
async function view(row: DraftRow, user: CausaAccessUser, client: WritingClient, canWrite: boolean, cache?: Map<string, unknown>): Promise<WritingDraftView> {
  const refs = await verifiedReferences(row.causaId, row.referencesJson, user, client, cache);
  return { id: row.id, causaId: row.causaId, title: row.title, body: row.body, revision: row.revision, references: refs, canWrite, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(), warnings: warnings(row.body, refs) };
}
async function revisionView(causaId: string, row: RevisionRow, actor: CausaAccessUser, client: WritingClient, canWrite: boolean): Promise<WritingRevisionView> {
  const refs = await verifiedReferences(causaId, row.referencesJson, actor, client);
  return { draftId: row.draftId, revision: row.revision, title: row.title, body: row.body, references: refs, createdAt: row.createdAt.toISOString(), change: row.change as WritingChange, restoredFrom: row.restoredFrom, canRestore: canWrite, warnings: warnings(row.body, refs) };
}
function inputHash(action: string, input: unknown) { return sha256(JSON.stringify({ action, input })); }
async function receipt(client: WritingClient, row: DraftRow, requestId: string, hash: string) {
  const previous = await client.caseWritingRequest.findUnique({ where: { draftId_requestId: { draftId: row.id, requestId } } });
  if (!previous) return false;
  if (previous.inputSha256 !== hash) throw Object.assign(writingChanged(), { code: "writing_conflict" });
  return true;
}
async function recordRequest(client: WritingClient, row: DraftRow, requestId: string, hash: string) {
  await client.caseWritingRequest.create({ data: { draftId: row.id, requestId, inputSha256: hash, resultingRevision: row.revision } });
}
async function snapshot(client: WritingClient, row: DraftRow, change: WritingChange, restoredFrom: number | null = null) {
  await client.caseWritingRevision.create({ data: { draftId: row.id, revision: row.revision, title: row.title, body: row.body, referencesJson: row.referencesJson, change, restoredFrom } });
}
async function audit(client: WritingClient, actor: CausaAccessUser, row: DraftRow, change: WritingChange, restoredFrom?: number | null) {
  await writeAuditStrict({ actorId: actor.id, action: `case.writing.${change}`, entityType: "CaseWritingDraft", entityId: row.id, after: { causaId: row.causaId, revision: row.revision, ...(restoredFrom ? { restoredFrom } : {}) } }, client);
}
async function updateRow(client: WritingClient, row: DraftRow, data: Pick<DraftRow, "title" | "body" | "referencesJson"> & { nextReferenceNumber?: number }) {
  const changed = await client.caseWritingDraft.updateMany({ where: { id: row.id, revision: row.revision }, data: { ...data, revision: { increment: 1 } } });
  if (changed.count !== 1) throw Object.assign(writingChanged(), { code: "writing_conflict" });
  return client.caseWritingDraft.findUniqueOrThrow({ where: { id: row.id } });
}
function expected(row: DraftRow, revision: number) {
  if (row.revision !== revision) throw Object.assign(writingChanged(), { code: "writing_conflict" });
}

export async function createCaseWriting(causaId: string, raw: z.input<typeof writingCreateSchema>, user: CausaAccessUser, client: PrismaClient = prisma): Promise<WritingMutationResult> {
  const input = writingCreateSchema.parse(raw), hash = inputHash("created", input);
  return writingTransaction(client, async tx => {
    const { actor, canWrite } = await writingActor(causaId, user, tx, true);
    const existing = await tx.caseWritingDraft.findUnique({ where: { ownerId_causaId_requestId: { ownerId: actor.id, causaId, requestId: input.requestId } } });
    if (existing) {
      if (existing.createInputSha256 !== hash) throw Object.assign(writingChanged(), { code: "writing_conflict" });
      return { draft: await view(existing, actor, tx, canWrite), reused: true };
    }
    if (await tx.caseWritingDraft.count({ where: { ownerId: actor.id, causaId } }) >= WRITING_LIMITS.draftsPerOwnerCase) throw httpError("La causa admite hasta 200 escritos privados por profesional", 413);
    const row = await tx.caseWritingDraft.create({ data: { causaId, ownerId: actor.id, requestId: input.requestId, createInputSha256: hash, title: input.title, body: input.body } });
    await snapshot(tx, row, "created"); await audit(tx, actor, row, "created");
    return { draft: await view(row, actor, tx, canWrite), reused: false };
  });
}
export async function listCaseWritings(causaId: string, user: CausaAccessUser, after?: string, client: PrismaClient = prisma): Promise<WritingDraftList> {
  return writingTransaction(client, async tx => {
    const { actor, canWrite } = await writingActor(causaId, user, tx);
    if (after && !await tx.caseWritingDraft.count({ where: { id: after, causaId, ownerId: actor.id } })) throw writingMissing();
    const rows = await tx.caseWritingDraft.findMany({ where: { causaId, ownerId: actor.id }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], ...(after ? { cursor: { id: after }, skip: 1 } : {}), take: WRITING_LIMITS.listPage + 1 });
    const drafts: WritingDraftList["drafts"] = [], cache = new Map<string, unknown>();
    for (const row of rows.slice(0, WRITING_LIMITS.listPage)) {
      try { await verifiedReferences(causaId, row.referencesJson, actor, tx, cache); drafts.push({ id: row.id, available: true, title: row.title, revision: row.revision, updatedAt: row.updatedAt.toISOString() }); }
      catch (error) { if (!writingUnavailable(error)) throw error; drafts.push({ id: row.id, available: false }); }
    }
    return { drafts, canWrite, limited: rows.length > WRITING_LIMITS.listPage, nextAfter: rows.length > WRITING_LIMITS.listPage ? rows[WRITING_LIMITS.listPage - 1].id : null };
  });
}
export async function readCaseWriting(causaId: string, id: string, user: CausaAccessUser, client: PrismaClient = prisma): Promise<WritingDraftView> {
  return writingTransaction(client, async tx => { const { actor, row, canWrite } = await rowFor(causaId, id, user, tx); return view(row, actor, tx, canWrite); });
}
export async function readCaseWritingForExport(causaId: string, id: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  return writingTransaction(client, async tx => {
    const { actor, row, canWrite } = await rowFor(causaId, id, user, tx);
    const caseIdentity = await tx.causa.findUniqueOrThrow({ where: { id: causaId }, select: { id: true, titulo: true, rit: true } });
    return { draft: await view(row, actor, tx, canWrite), caseIdentity };
  });
}
export async function saveCaseWriting(causaId: string, id: string, raw: z.input<typeof writingSaveSchema>, user: CausaAccessUser, client: PrismaClient = prisma): Promise<WritingMutationResult> {
  const input = writingSaveSchema.parse(raw), hash = inputHash("saved", input);
  return writingTransaction(client, async tx => {
    const { actor, row, canWrite } = await rowFor(causaId, id, user, tx, true);
    if (await receipt(tx, row, input.requestId, hash)) return { draft: await view(row, actor, tx, canWrite), reused: true };
    // Current references are checked before returning a concurrency conflict as well.
    // A stale editor must not keep receiving source-derived text after revocation.
    await verifiedReferences(causaId, row.referencesJson, actor, tx); expected(row, input.expectedRevision);
    if (row.title === input.title && row.body === input.body) {
      await recordRequest(tx, row, input.requestId, hash);
      return { draft: await view(row, actor, tx, canWrite), reused: false };
    }
    const next = await updateRow(tx, row, { title: input.title, body: input.body, referencesJson: row.referencesJson });
    await snapshot(tx, next, "saved"); await recordRequest(tx, next, input.requestId, hash); await audit(tx, actor, next, "saved");
    return { draft: await view(next, actor, tx, canWrite), reused: false };
  });
}
export async function addCaseWritingSource(causaId: string, id: string, raw: z.input<typeof writingAddSourceSchema>, user: CausaAccessUser, client: PrismaClient = prisma): Promise<WritingMutationResult> {
  const input = writingAddSourceSchema.parse(raw), hash = inputHash("source_added", input);
  return writingTransaction(client, async tx => {
    const { actor, row, canWrite } = await rowFor(causaId, id, user, tx, true);
    if (await receipt(tx, row, input.requestId, hash)) return { draft: await view(row, actor, tx, canWrite), reused: true };
    const current = await verifiedReferences(causaId, row.referencesJson, actor, tx); expected(row, input.expectedRevision);
    const source = await captureWritingSource(causaId, input.source, actor, tx);
    if (current.some(ref => ref.source.fingerprint === source.fingerprint)) { await recordRequest(tx, row, input.requestId, hash); return { draft: await view(row, actor, tx, canWrite), reused: false }; }
    if (current.length >= WRITING_LIMITS.references || current.reduce((count, ref) => count + ref.source.citations.length, source.citations.length) > WRITING_LIMITS.citations) throw httpError("El escrito admite hasta 20 incorporaciones y 100 pasajes de respaldo; prepare otro escrito para ampliar el alcance", 413);
    const refId = `R${row.nextReferenceNumber}`, body = [row.body.trimEnd(), `${source.text}\n\n[^${refId}]`].filter(Boolean).join("\n\n");
    if (body.length > WRITING_LIMITS.body) throw httpError("El escrito supera los 100.000 caracteres; reduzca el texto antes de incorporar otra fuente", 413);
    const nextReferences = [...references(row.referencesJson), { id: refId, source }];
    const json = JSON.stringify(nextReferences); if (json.length > 2_000_000) throw httpError("Las referencias superan el tamaño permitido; prepare otro escrito", 413);
    const next = await updateRow(tx, row, { title: row.title, body, referencesJson: json, nextReferenceNumber: row.nextReferenceNumber + 1 });
    await snapshot(tx, next, "source_added"); await recordRequest(tx, next, input.requestId, hash); await audit(tx, actor, next, "source_added");
    return { draft: await view(next, actor, tx, canWrite), reused: false };
  });
}
export async function listCaseWritingHistory(causaId: string, id: string, user: CausaAccessUser, before?: number, client: PrismaClient = prisma): Promise<WritingHistory> {
  return writingTransaction(client, async tx => {
    await rowFor(causaId, id, user, tx);
    const rows = await tx.caseWritingRevision.findMany({ where: { draftId: id, ...(before ? { revision: { lt: before } } : {}) }, orderBy: { revision: "desc" }, take: WRITING_LIMITS.historyPage + 1, select: { revision: true, createdAt: true, change: true, restoredFrom: true } });
    // Only neutral metadata: source-derived titles/bodies are checked on explicit preview.
    return { revisions: rows.slice(0, WRITING_LIMITS.historyPage).map(row => ({ revision: row.revision, available: true as const, title: `Versión ${row.revision}`, createdAt: row.createdAt.toISOString(), change: row.change as WritingChange, restoredFrom: row.restoredFrom })), limited: rows.length > WRITING_LIMITS.historyPage, nextBefore: rows.length > WRITING_LIMITS.historyPage ? rows[WRITING_LIMITS.historyPage - 1].revision : null };
  });
}
export async function readCaseWritingRevision(causaId: string, id: string, revision: number, user: CausaAccessUser, client: PrismaClient = prisma): Promise<WritingRevisionView> {
  return writingTransaction(client, async tx => {
    const { actor, canWrite } = await rowFor(causaId, id, user, tx);
    const row = await tx.caseWritingRevision.findUnique({ where: { draftId_revision: { draftId: id, revision } } });
    if (!row) throw writingMissing();
    return revisionView(causaId, row, actor, tx, canWrite);
  });
}
export async function restoreCaseWriting(causaId: string, id: string, raw: z.input<typeof writingRestoreSchema>, user: CausaAccessUser, client: PrismaClient = prisma): Promise<WritingMutationResult> {
  const input = writingRestoreSchema.parse(raw), hash = inputHash("restored", input);
  return writingTransaction(client, async tx => {
    const { actor, row, canWrite } = await rowFor(causaId, id, user, tx, true);
    if (await receipt(tx, row, input.requestId, hash)) return { draft: await view(row, actor, tx, canWrite), reused: true };
    expected(row, input.expectedRevision);
    const target = await tx.caseWritingRevision.findUnique({ where: { draftId_revision: { draftId: id, revision: input.targetRevision } } });
    if (!target) throw writingMissing();
    await verifiedReferences(causaId, target.referencesJson, actor, tx);
    // A clean old revision can recover a draft whose current references were revoked.
    // Restoring always makes a new version and never decrements the reference counter.
    const next = await updateRow(tx, row, { title: target.title, body: target.body, referencesJson: target.referencesJson });
    await snapshot(tx, next, "restored", target.revision); await recordRequest(tx, next, input.requestId, hash); await audit(tx, actor, next, "restored", target.revision);
    return { draft: await view(next, actor, tx, canWrite), reused: false };
  });
}
