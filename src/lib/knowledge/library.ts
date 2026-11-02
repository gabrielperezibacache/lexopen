import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { causaAccessWhere, siteAccessWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { writeAuditStrict } from "@/lib/audit";
import { sha256 } from "@/lib/evidence/fragments";
import { resolveCitation, verifyStoredCitation, toStoredCitation, type StoredCitation, type ResolvedCitation } from "./citations";

type Client = Prisma.TransactionClient | PrismaClient;
export const LIBRARY_LIMITS = { collections: 100, items: 200, selectedCollections: 10, selectedItems: 200 } as const;
const id = z.string().min(1).max(100);
export const libraryCreateSchema = z.object({ requestId: z.string().min(10).max(120).regex(/^[A-Za-z0-9-]+$/), name: z.string().trim().min(3).max(200), instructions: z.string().trim().max(4000).default(""), causaId: id.optional(), siteId: id.optional() }).strict().refine(input => !(input.causaId && input.siteId), { message: "Elija una causa o un espacio", path: ["siteId"] });
export const libraryUpdateSchema = z.object({ expectedRevision: z.number().int().min(1).max(2000000000), name: z.string().trim().min(3).max(200), instructions: z.string().trim().max(4000) }).strict();
export const libraryItemSchema = z.object({ expectedRevision: z.number().int().min(1).max(2000000000), citation: z.object({ kind: z.enum(["document", "legal"]), fragmentId: id, quote: z.string().min(1).max(10000) }).strict() }).strict();
export const libraryRevisionSchema = z.object({ expectedRevision: z.number().int().min(1).max(2000000000) }).strict();
const collectionSelect = { id: true, ownerId: true, name: true, instructions: true, revision: true, causaId: true, siteId: true, createdAt: true, updatedAt: true, causa: { select: { id: true, titulo: true } }, site: { select: { id: true, name: true } } } as const;

async function actorFor(user: CausaAccessUser, client: Client) {
  const actor = await client.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
  if (!actor || !isStaff(actor.role) || !canSome(actor, "assistant.use")) throw httpError("No tiene permiso para usar la biblioteca", 403);
  return actor;
}
async function transaction<T>(client: PrismaClient, run: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try { return await client.$transaction(run, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 }); }
    catch (error) { if (attempt >= 3 || !(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2034", "P2002"].includes(error.code)) throw error; }
  }
}
function collectionWhere(actor: CausaAccessUser): Prisma.KnowledgeCollectionWhereInput {
  return { ownerId: actor.id, AND: [{ OR: [{ causaId: null }, { causa: causaAccessWhere(actor) }] }, { OR: [{ siteId: null }, { site: siteAccessWhere(actor) }] }, { OR: [{ causaId: null }, { siteId: null }] }] };
}
async function readCollectionRow(collectionId: string, actor: CausaAccessUser, client: Client) {
  const collection = await client.knowledgeCollection.findFirst({ where: { AND: [{ id: collectionId }, collectionWhere(actor)] }, select: collectionSelect });
  if (!collection) throw httpError("Colección no encontrada o sin acceso", 404);
  return collection;
}
function citationScope(collection: { causaId: string | null; siteId: string | null }, client: Client, cache?: Map<string, unknown>) {
  return { ...(collection.causaId ? { causaId: collection.causaId } : {}), ...(collection.siteId ? { siteId: collection.siteId } : {}), publicOnly: !collection.causaId && !collection.siteId, client, cache };
}
const unavailable = (error: unknown) => error instanceof SyntaxError || Boolean(error && typeof error === "object" && "status" in error && [400, 404, 409].includes(Number(error.status)));
function summary<T extends { ownerId: string; causaId: string | null; siteId: string | null; causa?: {titulo: string} | null; site?: {name: string} | null }>(collection: T) {
  const { ownerId: _ownerId, ...rest } = collection; void _ownerId;
  return { ...rest, scopeLabel: collection.causaId ? `Expediente · ${collection.causa?.titulo || "Autorizado"}` : collection.siteId ? `Espacio · ${collection.site?.name || "Autorizado"}` : "Fuentes jurídicas públicas" };
}

export async function listLibraryCollections(user: CausaAccessUser, client: PrismaClient = prisma) {
  const actor = await actorFor(user, client);
  const rows = await client.knowledgeCollection.findMany({ where: collectionWhere(actor), orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: LIBRARY_LIMITS.collections + 1, select: { ...collectionSelect, _count: { select: { items: true } } } });
  return { collections: rows.slice(0, LIBRARY_LIMITS.collections).map(({ _count, ...row }) => ({ ...summary(row), itemCount: _count.items })), limited: rows.length > LIBRARY_LIMITS.collections };
}
export async function createLibraryCollection(raw: z.input<typeof libraryCreateSchema>, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = libraryCreateSchema.parse(raw);
  return transaction(client, async tx => {
    const actor = await actorFor(user, tx);
    if (input.causaId && !await tx.causa.count({ where: { AND: [{ id: input.causaId }, causaAccessWhere(actor)] } }) || input.siteId && !await tx.site.count({ where: { AND: [{ id: input.siteId }, siteAccessWhere(actor)] } })) throw httpError("Ámbito no encontrado o sin acceso", 404);
    const collectionId = `col_${sha256(`${actor.id}:${input.requestId}`).slice(0, 40)}`;
    const existing = await tx.knowledgeCollection.findUnique({ where: { id: collectionId }, select: collectionSelect });
    if (existing) {
      if (existing.ownerId !== actor.id || existing.name !== input.name || existing.instructions !== input.instructions || existing.causaId !== (input.causaId || null) || existing.siteId !== (input.siteId || null)) throw httpError("La solicitud ya creó una colección distinta; recargue antes de continuar", 409);
      await readCollectionRow(existing.id, actor, tx);
      return { collection: summary(existing), reused: true };
    }
    if (await tx.knowledgeCollection.count({ where: { ownerId: actor.id } }) >= LIBRARY_LIMITS.collections) throw httpError("La biblioteca admite hasta 100 colecciones por persona", 413);
    const row = await tx.knowledgeCollection.create({ data: { id: collectionId, ownerId: actor.id, name: input.name, instructions: input.instructions, causaId: input.causaId, siteId: input.siteId }, select: collectionSelect });
    await writeAuditStrict({ actorId: actor.id, action: "knowledge.collection.create", entityType: "KnowledgeCollection", entityId: row.id, after: { causaId: row.causaId, siteId: row.siteId, revision: row.revision } }, tx);
    return { collection: summary(row), reused: false };
  });
}
export async function readLibraryCollection(collectionId: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  return transaction(client, async tx => {
    const actor = await actorFor(user, tx), collection = await readCollectionRow(collectionId, actor, tx);
    const cache = new Map<string, unknown>();
    const rows = await tx.knowledgeCollectionItem.findMany({ where: { collectionId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: LIBRARY_LIMITS.items + 1, select: { id: true, citationJson: true, createdAt: true } });
    const items: ({ id: string; available: true; citation: ResolvedCitation; createdAt: Date } | { id: string; available: false; createdAt: Date })[] = [];
    for (const row of rows.slice(0, LIBRARY_LIMITS.items)) {
      try { const citation = await verifyStoredCitation(JSON.parse(row.citationJson) as StoredCitation, actor, citationScope(collection, tx, cache)); items.push({ id: row.id, available: true, citation, createdAt: row.createdAt }); }
      catch (error) { if (!unavailable(error)) throw error; items.push({ id: row.id, available: false, createdAt: row.createdAt }); }
    }
    return { ...summary(collection), items, limited: rows.length > LIBRARY_LIMITS.items };
  });
}
export async function updateLibraryCollection(collectionId: string, raw: z.input<typeof libraryUpdateSchema>, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = libraryUpdateSchema.parse(raw);
  return transaction(client, async tx => {
    const actor = await actorFor(user, tx), row = await readCollectionRow(collectionId, actor, tx);
    if (row.name === input.name && row.instructions === input.instructions && row.revision === input.expectedRevision + 1) return { collection: summary(row), reused: true };
    if (row.revision !== input.expectedRevision) throw httpError("La colección cambió; recargue antes de editar", 409);
    const changed = await tx.knowledgeCollection.updateMany({ where: { id: row.id, ownerId: actor.id, revision: input.expectedRevision }, data: { name: input.name, instructions: input.instructions, revision: { increment: 1 } } });
    if (changed.count !== 1) throw httpError("La colección cambió; recargue antes de editar", 409);
    await writeAuditStrict({ actorId: actor.id, action: "knowledge.collection.update", entityType: "KnowledgeCollection", entityId: row.id, after: { revision: row.revision + 1 } }, tx);
    return { collection: summary(await readCollectionRow(row.id, actor, tx)), reused: false };
  });
}
export async function deleteLibraryCollection(collectionId: string, raw: z.input<typeof libraryRevisionSchema>, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = libraryRevisionSchema.parse(raw);
  return transaction(client, async tx => {
    const actor = await actorFor(user, tx), row = await readCollectionRow(collectionId, actor, tx);
    const deleted = await tx.knowledgeCollection.deleteMany({ where: { id: row.id, ownerId: actor.id, revision: input.expectedRevision } });
    if (deleted.count !== 1) throw httpError("La colección cambió; recargue antes de eliminar", 409);
    await writeAuditStrict({ actorId: actor.id, action: "knowledge.collection.delete", entityType: "KnowledgeCollection", entityId: row.id, before: { revision: row.revision } }, tx);
    return { deleted: true };
  });
}
export async function addLibraryItem(collectionId: string, raw: z.input<typeof libraryItemSchema>, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = libraryItemSchema.parse(raw);
  return transaction(client, async tx => {
    const actor = await actorFor(user, tx), collection = await readCollectionRow(collectionId, actor, tx);
    const cache = new Map<string, unknown>();
    const citation = await resolveCitation(input.citation, actor, citationScope(collection, tx, cache));
    const versionKey = `${citation.kind}:${citation.versionId}`;
    const prior = await tx.knowledgeCollectionItem.findUnique({ where: { collectionId_versionKey: { collectionId, versionKey } } });
    if (prior) { await verifyStoredCitation(JSON.parse(prior.citationJson) as StoredCitation, actor, citationScope(collection, tx, cache)); return { collection: summary(collection), item: { id: prior.id }, reused: true }; }
    if (await tx.knowledgeCollectionItem.count({ where: { collectionId } }) >= LIBRARY_LIMITS.items) throw httpError("La colección admite hasta 200 versiones", 413);
    const changed = await tx.knowledgeCollection.updateMany({ where: { id: collectionId, ownerId: actor.id, revision: input.expectedRevision }, data: { revision: { increment: 1 } } });
    if (changed.count !== 1) throw httpError("La colección cambió; recargue antes de añadir", 409);
    const item = await tx.knowledgeCollectionItem.create({ data: { collectionId, versionKey, citationJson: JSON.stringify(toStoredCitation(citation)) }, select: { id: true } });
    await writeAuditStrict({ actorId: actor.id, action: "knowledge.collection.item.add", entityType: "KnowledgeCollection", entityId: collectionId, after: { itemId: item.id, versionKey, revision: input.expectedRevision + 1 } }, tx);
    return { collection: summary(await readCollectionRow(collectionId, actor, tx)), item, reused: false };
  });
}
export async function removeLibraryItem(collectionId: string, itemId: string, raw: z.input<typeof libraryRevisionSchema>, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = libraryRevisionSchema.parse(raw);
  return transaction(client, async tx => {
    const actor = await actorFor(user, tx), collection = await readCollectionRow(collectionId, actor, tx);
    const item = await tx.knowledgeCollectionItem.findFirst({ where: { id: itemId, collectionId }, select: { id: true } });
    if (!item) return { collection: summary(collection), reused: true };
    const changed = await tx.knowledgeCollection.updateMany({ where: { id: collectionId, ownerId: actor.id, revision: input.expectedRevision }, data: { revision: { increment: 1 } } });
    if (changed.count !== 1) throw httpError("La colección cambió; recargue antes de retirar", 409);
    await tx.knowledgeCollectionItem.delete({ where: { id: itemId } });
    await writeAuditStrict({ actorId: actor.id, action: "knowledge.collection.item.remove", entityType: "KnowledgeCollection", entityId: collectionId, after: { itemId, revision: input.expectedRevision + 1 } }, tx);
    return { collection: summary(await readCollectionRow(collectionId, actor, tx)), reused: false };
  });
}

export type LibrarySelection = { collectionId: string; itemIds: string[]; citationKeys: string[]; instructionsSha256: string };
export type ResolvedLibraryScope = { selections: LibrarySelection[]; legalVersionIds: string[]; documentVersionIds: string[]; citations: ResolvedCitation[]; warnings: string[]; itemsAvailable: number; itemsUnavailable: number };
/** Explicit collections are snapshots of pinned versions, never a grant to new documents. */
export async function resolveLibraryScope(collectionIds: string[], user: CausaAccessUser, scope: { causaId?: string; siteId?: string }, client: Client = prisma): Promise<ResolvedLibraryScope> {
  const actor = await actorFor(user, client);
  const ids = [...new Set(collectionIds)];
  if (ids.length > LIBRARY_LIMITS.selectedCollections) throw httpError("Elija hasta diez colecciones", 400);
  const result: ResolvedLibraryScope = { selections: [], legalVersionIds: [], documentVersionIds: [], citations: [], warnings: [], itemsAvailable: 0, itemsUnavailable: 0 };
  const cache = new Map<string, unknown>();
  for (const collectionId of ids) {
    const collection = await readCollectionRow(collectionId, actor, client);
    if (collection.causaId && collection.causaId !== scope.causaId || collection.siteId && collection.siteId !== scope.siteId) throw httpError("La colección pertenece a otro ámbito; elija su causa o espacio antes de consultar", 409);
    const rows = await client.knowledgeCollectionItem.findMany({ where: { collectionId }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: LIBRARY_LIMITS.items + 1 });
    if (rows.length > LIBRARY_LIMITS.items || result.itemsAvailable + result.itemsUnavailable + rows.length > LIBRARY_LIMITS.selectedItems) throw httpError("Las colecciones seleccionadas superan 200 versiones; acote la selección", 413);
    const selection: LibrarySelection = { collectionId, itemIds: [], citationKeys: [], instructionsSha256: sha256(collection.instructions) };
    for (const row of rows) {
      try {
        const citation = await verifyStoredCitation(JSON.parse(row.citationJson) as StoredCitation, actor, citationScope(collection, client, cache));
        selection.itemIds.push(row.id); selection.citationKeys.push(sha256(JSON.stringify(toStoredCitation(citation))));
        result.citations.push(citation); result.itemsAvailable++;
        result.warnings.push(...citation.warnings);
        (citation.kind === "legal" ? result.legalVersionIds : result.documentVersionIds).push(citation.versionId);
      } catch (error) { if (!unavailable(error)) throw error; result.itemsUnavailable++; }
    }
    result.selections.push(selection);
  }
  if (result.itemsUnavailable) result.warnings.push(`${result.itemsUnavailable} entradas de biblioteca no pudieron autorizarse o verificarse y quedaron fuera de la consulta`);
  if (result.selections.length) result.warnings.push("Biblioteca: se consultan las versiones guardadas, aunque exista una posterior. Sus notas son contexto manual y no instrucciones ejecutadas.");
  result.legalVersionIds = [...new Set(result.legalVersionIds)]; result.documentVersionIds = [...new Set(result.documentVersionIds)]; result.warnings = [...new Set(result.warnings)];
  return result;
}
export async function libraryScopeStillAuthorized(selections: LibrarySelection[], user: CausaAccessUser, scope: { causaId?: string; siteId?: string }, client: Client = prisma) {
  if (!Array.isArray(selections) || selections.length > LIBRARY_LIMITS.selectedCollections) return false;
  const actor = await actorFor(user, client); let count = 0; const cache = new Map<string, unknown>();
  for (const selection of selections) {
    if (!selection || typeof selection.collectionId !== "string" || !Array.isArray(selection.itemIds) || !Array.isArray(selection.citationKeys) || selection.itemIds.length !== selection.citationKeys.length || selection.itemIds.some(id => typeof id !== "string") || selection.citationKeys.some(key => typeof key !== "string") || typeof selection.instructionsSha256 !== "string") return false;
    count += selection.itemIds.length; if (count > LIBRARY_LIMITS.selectedItems) return false;
    try {
      const collection = await readCollectionRow(selection.collectionId, actor, client);
      if (collection.causaId && collection.causaId !== scope.causaId || collection.siteId && collection.siteId !== scope.siteId || sha256(collection.instructions) !== selection.instructionsSha256) return false;
      for (let index = 0; index < selection.itemIds.length; index++) {
        const row = await client.knowledgeCollectionItem.findFirst({ where: { id: selection.itemIds[index], collectionId: collection.id }, select: { citationJson: true } });
        if (!row) return false;
        const citation = await verifyStoredCitation(JSON.parse(row.citationJson) as StoredCitation, actor, citationScope(collection, client, cache));
        if (sha256(JSON.stringify(toStoredCitation(citation))) !== selection.citationKeys[index]) return false;
      }
    } catch (error) { if (!unavailable(error)) throw error; return false; }
  }
  return true;
}
