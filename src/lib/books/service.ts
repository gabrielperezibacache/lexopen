import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { sha256, splitEvidenceText, verifyEvidenceQuote } from "@/lib/evidence/fragments";
import { renderPdfPage } from "@/lib/evidence/pdf-pages";
import { discardBookImportAttempt, getObjectBounded, putObject } from "@/lib/storage";
import { actorFor, bookAccessWhere, bookFor, collectionAccessWhere, missingBook, type BookClient } from "./access";
import { extractBook, BOOK_FORMATS, BOOK_MAX_BYTES } from "./formats";
import { bookMetadataSchema, bookPatchSchema, bookRevisionSchema, type BookUpload } from "./ingest";
import { bookSourceTypeSchema, normalizeJudicialMetadata, parseStoredJudicialSource } from "./judicial";
import type { BookCitation, BookCitationInput, BookCollectionView, BookPreferences, BookSummary } from "./types";
export const BOOK_LIMITS = { books: 200, collections: 100, collectionBooks: 200, collectionMembers: 50, fragmentsPerPage: 100 } as const;
const summarySelect = { id: true, ownerId: true, title: true, author: true, year: true, edition: true, publisher: true, identifier: true, sourceType: true, judicialJson: true, coverColor: true, coverStyle: true, spineLabel: true, shelf: true, favorite: true, sourceName: true, mimeType: true, sourceSha256: true, originalRetained: true, convertedToText: true, retainedSha256: true, originalBytes: true, retainedBytes: true, conversionJson: true, status: true, pageCount: true, locatorKind: true, revision: true, createdAt: true, owner: { select: { name: true } }, _count: { select: { fragments: true } } } satisfies Prisma.LibraryBookSelect;
type SummaryRow = Prisma.LibraryBookGetPayload<{ select: typeof summarySelect }>;
function sourceMetadata(row: { sourceType: string; judicialJson: string }) {
  try { return parseStoredJudicialSource(row); }
  catch { throw httpError("Los datos judiciales conservados no son válidos; revise la ficha antes de utilizar esta fuente", 409); }
}
function summary(row: SummaryRow, ownerId: string): BookSummary { const { owner, _count, judicialJson: _judicialJson, ...book } = row; void _judicialJson; return { ...book, ...sourceMetadata(row), ownerName: owner.name, owned: row.ownerId === ownerId, fragmentCount: _count.fragments, createdAt: row.createdAt.toISOString() }; }
export async function bookTransaction<T>(client: PrismaClient, action: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt++) { try { return await client.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 }); } catch (error) { if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) continue; throw error; } }
}
export async function listBooks(user: CausaAccessUser, client: PrismaClient = prisma) {
  const actor = await actorFor(user, client), rows = await client.libraryBook.findMany({ where: bookAccessWhere(actor), select: summarySelect, orderBy: [{ favorite: "desc" }, { createdAt: "desc" }, { id: "asc" }], take: BOOK_LIMITS.books + 1 });
  return { books: rows.slice(0, BOOK_LIMITS.books).map(row => summary(row, actor.id)), collections: await listBookCollections(actor, client), preferences: await readBookPreferences(actor, client), limits: { ...BOOK_LIMITS, formats: BOOK_FORMATS, maxBytes: BOOK_MAX_BYTES, booksLimited: rows.length > BOOK_LIMITS.books } };
}
async function discardImportAttempt(key: string, failure?: unknown) {
  try { await discardBookImportAttempt(key); }
  catch (cleanupError) {
    // The key contains opaque IDs/digests only; never log document names, bytes or text.
    console.error("library.book.import.cleanup_failed", { key, code: "book_import_attempt_cleanup" });
    const error = new AggregateError(failure === undefined ? [cleanupError] : [failure, cleanupError], "No se pudo retirar un archivo temporal de la importación. Consulte al administrador del almacenamiento antes de volver a importar", { cause: failure ?? cleanupError });
    throw Object.assign(error, { status: 503 });
  }
}
export async function importBook(input: BookUpload, user: CausaAccessUser, client: PrismaClient = prisma) {
  const actor = await actorFor(user, client), metadata = bookMetadataSchema.parse(input), sourceSha256 = sha256(input.bytes), preferences = await readBookPreferences(actor, client);
  const sourceType = bookSourceTypeSchema.parse(input.sourceType ?? "book"), judicial = normalizeJudicialMetadata(sourceType, input.judicial), judicialJson = JSON.stringify(judicial ?? {});
  const convertToText = z.boolean().parse(input.convertToText ?? preferences.defaultConvertToText), preserveOriginal = z.boolean().parse(input.preserveOriginal ?? preferences.defaultPreserveOriginal);
  if (!preserveOriginal && !convertToText) throw httpError("Para omitir el original, active la conversión a texto", 400);
  const requestId = z.string().trim().min(8).max(100).parse(input.requestId);
  const sameImport = (prior: { sourceSha256: string; deletedAt: Date | null; originalRetained: boolean; convertedToText: boolean }) => prior.sourceSha256 === sourceSha256 && !prior.deletedAt && prior.originalRetained === preserveOriginal && prior.convertedToText === convertToText;
  const prior = await client.libraryBook.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId } }, select: { id: true, sourceSha256: true, deletedAt: true, originalRetained: true, convertedToText: true } });
  if (prior) { if (!sameImport(prior)) throw httpError("Esta importación ya se utilizó con otro archivo u opciones; inicie una nueva", 409); return { book: (await readBook(prior.id, actor, {}, client)).book, reused: true }; }
  if (await client.libraryBook.count({ where: { ownerId: actor.id, deletedAt: null } }) >= BOOK_LIMITS.books) throw httpError("Su biblioteca admite hasta 200 libros en esta versión", 413);
  const extracted = await extractBook(input.name, input.bytes), id = `book_${sha256(`${actor.id}:${requestId}`).slice(0, 40)}`;
  const retained = preserveOriginal ? input.bytes : Buffer.from(extracted.text, "utf8"), retainedSha256 = sha256(retained), storageKey = `library-books/${id}/attempts/${randomUUID()}/${preserveOriginal ? "original" : "text"}/${retainedSha256}`;
  const fragments = preserveOriginal ? extracted.fragments : splitEvidenceText(extracted.text).map(fragment => ({ ...fragment, pageNumber: null, pageStartOffset: null, pageEndOffset: null, locatorLabel: `Texto retenido · fragmento ${fragment.ordinal}` }));
  const pages = preserveOriginal ? extracted.pages : [], pageCount = preserveOriginal ? extracted.pageCount : null, locatorKind = preserveOriginal ? extracted.locatorKind : "converted-text";
  const conversion = { version: 1, method: extracted.locatorKind === "pdf-page" ? "local-pdf-extraction" : "local-format-extraction", originalRetained: preserveOriginal, convertedToText: convertToText, partial: extracted.status !== "completed", ocrPages: extracted.pages.filter(page => page.method === "ocr").length, unavailablePages: extracted.pages.filter(page => ["needs_ocr", "failed", "limit"].includes(page.status)).length, sourcePageCount: extracted.pageCount, preparedCharacters: extracted.text.length };
  let result: { book: BookSummary; reused: boolean };
  try {
    await putObject({ key: storageKey, body: retained, contentType: preserveOriginal ? extracted.mimeType : "text/plain; charset=utf-8" });
    result = await bookTransaction(client, async tx => {
    await actorFor(actor, tx);
    const existing = await tx.libraryBook.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId } }, select: { id: true, sourceSha256: true, deletedAt: true, originalRetained: true, convertedToText: true } });
    if (existing) { if (!sameImport(existing)) throw httpError("La clave de importación ya corresponde a otro archivo u opciones", 409); const book = await tx.libraryBook.findUniqueOrThrow({ where: { id: existing.id }, select: summarySelect }); return { book: summary(book, actor.id), reused: true }; }
    if (await tx.libraryBook.count({ where: { ownerId: actor.id, deletedAt: null } }) >= BOOK_LIMITS.books) throw httpError("Su biblioteca admite hasta 200 libros", 413);
    const book = await tx.libraryBook.create({ data: { id, ownerId: actor.id, requestId, ...metadata, sourceType, judicialJson, sourceName: input.name, mimeType: extracted.mimeType, storageKey, sourceSha256, originalRetained: preserveOriginal, convertedToText: convertToText, retainedSha256, originalBytes: input.bytes.length, retainedBytes: retained.length, conversionJson: JSON.stringify(conversion), textSha256: sha256(extracted.text), extractedText: extracted.text, status: extracted.status, pageCount, locatorKind, fragments: { create: fragments }, pages: { create: pages.map(p => ({ pageNumber: p.pageNumber, text: p.text, textSha256: p.textSha256, method: p.method, status: p.status })) } }, select: summarySelect });
    await writeAuditStrict({ actorId: actor.id, action: "library.book.import", entityType: "LibraryBook", entityId: id, after: { sourceType, sourceSha256, retainedSha256, originalRetained: preserveOriginal, convertedToText: convertToText, textSha256: sha256(extracted.text), fragments: fragments.length, pageCount } }, tx);
    return { book: summary(book, actor.id), reused: false };
    });
  } catch (error) {
    await discardImportAttempt(storageKey, error);
    throw error;
  }
  // A committed winner references a different attempt. Discard only this losing upload.
  if (result.reused) await discardImportAttempt(storageKey);
  return result;
}
export async function readBook(id: string, user: CausaAccessUser, query: { after?: number; page?: number } = {}, client: PrismaClient = prisma) {
  const actor = await actorFor(user, client);
  const after = query.after || 0; if (!Number.isSafeInteger(after) || after < 0 || query.page !== undefined && (!Number.isInteger(query.page) || query.page < 1 || query.page > 500)) throw httpError("Ubicación de lectura inválida", 400);
  const row = await client.libraryBook.findFirst({ where: { AND: [{ id }, bookAccessWhere(actor)] }, select: summarySelect }); if (!row) throw missingBook();
  const fragments = await client.libraryBookFragment.findMany({ where: { bookId: id, ordinal: { gt: after }, ...(query.page ? { pageNumber: query.page } : {}) }, orderBy: { ordinal: "asc" }, take: BOOK_LIMITS.fragmentsPerPage + 1, select: { id: true, ordinal: true, text: true, pageNumber: true, locatorLabel: true } });
  const more = fragments.length > BOOK_LIMITS.fragmentsPerPage; if (more) fragments.pop();
  return { book: summary(row, actor.id), fragments, pages: await client.libraryBookPage.findMany({ where: { bookId: id }, orderBy: { pageNumber: "asc" }, select: { pageNumber: true, method: true, status: true } }), nextAfter: more ? fragments.at(-1)!.ordinal : null, limited: more };
}
export async function updateBook(id: string, raw: z.input<typeof bookPatchSchema>, user: CausaAccessUser, client: PrismaClient = prisma) {
  const { revision, sourceType: sourceTypePatch, judicial: judicialPatch, ...metadata } = bookPatchSchema.parse(raw);
  return bookTransaction(client, async tx => {
    const { actor, book } = await bookFor(id, user, tx, true);
    const sourceType = sourceTypePatch ?? bookSourceTypeSchema.parse(book.sourceType);
    const previous = book.sourceType === "book" ? null : sourceMetadata(book).judicial;
    const judicial = sourceType === "book" ? normalizeJudicialMetadata(sourceType, judicialPatch) : normalizeJudicialMetadata(sourceType, judicialPatch === null ? null : { ...previous, ...judicialPatch });
    const changed = await tx.libraryBook.updateMany({ where: { id, ownerId: actor.id, deletedAt: null, revision }, data: { ...metadata, sourceType, judicialJson: JSON.stringify(judicial ?? {}), revision: { increment: 1 } } });
    if (!changed.count) throw httpError("El libro cambió; vuelva a cargarlo antes de guardar", 409);
    await writeAuditStrict({ actorId: actor.id, action: "library.book.customize", entityType: "LibraryBook", entityId: id, before: { revision: book.revision, sourceType: book.sourceType }, after: { revision: revision + 1, sourceType, fields: [...Object.keys(metadata), ...(sourceTypePatch !== undefined ? ["sourceType"] : []), ...(judicialPatch !== undefined ? ["judicial"] : [])] } }, tx);
    return { book: summary(await tx.libraryBook.findUniqueOrThrow({ where: { id }, select: summarySelect }), actor.id) };
  });
}
export async function deleteBook(id: string, raw: z.input<typeof bookRevisionSchema>, user: CausaAccessUser, client: PrismaClient = prisma) {
  const { revision } = bookRevisionSchema.parse(raw);
  return bookTransaction(client, async tx => { const { actor } = await bookFor(id, user, tx, true); const changed = await tx.libraryBook.updateMany({ where: { id, ownerId: actor.id, revision, deletedAt: null }, data: { deletedAt: new Date(), revision: { increment: 1 } } }); if (!changed.count) throw httpError("El libro cambió; recargue antes de retirarlo", 409); await writeAuditStrict({ actorId: actor.id, action: "library.book.remove", entityType: "LibraryBook", entityId: id, after: { revision: revision + 1 } }, tx); return { deleted: true }; });
}
type RetainedBook = { storageKey: string; sourceSha256: string; retainedSha256: string | null; originalRetained: boolean; textSha256: string; extractedText: string };
async function verifiedBookBytes(book: RetainedBook, cache: Map<string, unknown>) {
  const expected = book.originalRetained ? book.sourceSha256 : book.retainedSha256;
  if (!expected || book.retainedSha256 && book.originalRetained && book.retainedSha256 !== book.sourceSha256 || !book.originalRetained && expected !== book.textSha256) throw httpError("La identidad del archivo retenido no coincide con el libro registrado", 409);
  const key = `book-retained:${book.storageKey}:${expected}`; if (cache.get(key) === true) return;
  const bytes = await getObjectBounded(book.storageKey);
  if (!bytes || sha256(bytes) !== expected || !book.originalRetained && !bytes.equals(Buffer.from(book.extractedText, "utf8"))) throw httpError(book.originalRetained ? "El original conservado no coincide con el libro registrado" : "El texto retenido no coincide con el libro registrado", 409);
  cache.set(key, true);
}
export async function readBookOriginal(id: string, user: CausaAccessUser, client: PrismaClient = prisma) { const { book } = await bookFor(id, user, client); if (!book.originalRetained) throw httpError("El original no se conservó al importar. Puede descargar el texto preparado", 410); await verifiedBookBytes(book, new Map()); const bytes = await getObjectBounded(book.storageKey); if (!bytes || sha256(bytes) !== book.sourceSha256) throw httpError("El original conservado no coincide con el libro registrado", 409); return { bytes, name: book.sourceName, mimeType: book.mimeType }; }
export async function readBookText(id: string, user: CausaAccessUser, client: PrismaClient = prisma) { const { book } = await bookFor(id, user, client); if (book.extractedText.length > 2_000_000 || sha256(book.extractedText) !== book.textSha256) throw httpError("El texto preparado no coincide con el libro registrado", 409); await verifiedBookBytes(book, new Map()); return { bytes: Buffer.from(book.extractedText, "utf8"), name: `${book.sourceName.replace(/\.[^.]+$/, "")}.txt`, mimeType: "text/plain", verificationBasis: book.originalRetained ? "original" as const : "retained_text" as const }; }
export async function readBookPage(id: string, page: number, user: CausaAccessUser, client: PrismaClient = prisma) { if (!Number.isSafeInteger(page) || page < 1 || page > 500) throw httpError("Página inválida", 400); const { book } = await bookFor(id, user, client); if (!book.originalRetained || book.locatorKind !== "pdf-page" || !await client.libraryBookPage.findUnique({ where: { bookId_pageNumber: { bookId: id, pageNumber: page } }, select: { id: true } })) throw missingBook(); const { bytes } = await readBookOriginal(id, user, client); return renderPdfPage(bytes, page, { expectedSourceSha256: book.sourceSha256 }); }

type VerifiedBookPage = { pageNumber: number; text: string; textSha256: string; method: string; startOffset: number };
/** Bind every retained PDF page to the exact whole-book text before trusting a page locator. */
async function verifiedPdfPages(book: { id: string; textSha256: string; extractedText: string; pageCount: number | null }, client: BookClient, cache: Map<string, unknown>) {
  const key = `book-pdf-pages:${book.id}:${book.textSha256}`, existing = cache.get(key);
  if (existing instanceof Map) return existing as Map<number, VerifiedBookPage>;
  const pages = await client.libraryBookPage.findMany({ where: { bookId: book.id }, orderBy: { pageNumber: "asc" }, take: 501, select: { pageNumber: true, text: true, textSha256: true, method: true } });
  const invalid = () => httpError("Las páginas no coinciden con el texto completo del libro registrado", 409);
  if (!pages.length || pages.length > 500 || book.pageCount === null || !Number.isSafeInteger(book.pageCount) || book.pageCount < pages.length || book.pageCount > 500) throw invalid();
  const result = new Map<number, VerifiedBookPage>(); let startOffset = 0;
  for (const [index, page] of pages.entries()) {
    if (!Number.isSafeInteger(page.pageNumber) || page.pageNumber !== index + 1 || page.text.length > 2_000_000 || sha256(page.text) !== page.textSha256) throw invalid();
    result.set(page.pageNumber, { ...page, startOffset });
    startOffset += page.text.length + (index < pages.length - 1 ? 2 : 0);
    if (startOffset > 2_000_000) throw invalid();
  }
  const whole = pages.map(page => page.text).join("\n\n");
  if (whole !== book.extractedText || sha256(whole) !== book.textSha256) throw invalid();
  cache.set(key, result);
  return result;
}
export async function resolveBookCitation(input: BookCitationInput, user: CausaAccessUser, options: { client?: BookClient; cache?: Map<string, unknown> } = {}): Promise<BookCitation> {
  const valid = z.object({ bookId: z.string().min(1).max(100), fragmentId: z.string().min(1).max(100), quote: z.string().min(1).max(10_000) }).strict().parse(input);
  const client = options.client || prisma, cache = options.cache || new Map<string, unknown>(), { book } = await bookFor(valid.bookId, user, client);
  const fragment = await client.libraryBookFragment.findFirst({ where: { id: valid.fragmentId, bookId: book.id } });
  if (!fragment || !verifyEvidenceQuote(fragment, valid.quote) || book.extractedText.length > 2_000_000 || !Number.isSafeInteger(fragment.startOffset) || !Number.isSafeInteger(fragment.endOffset) || fragment.startOffset < 0 || fragment.endOffset <= fragment.startOffset || fragment.endOffset > book.extractedText.length || fragment.endOffset - fragment.startOffset !== fragment.text.length || book.extractedText.slice(fragment.startOffset, fragment.endOffset) !== fragment.text || sha256(book.extractedText) !== book.textSha256) throw httpError("El pasaje no coincide con el texto del libro registrado", 409);
  await verifiedBookBytes(book, cache);
  let extractionMethod = "text";
  if (!book.originalRetained) { try { if (Number(JSON.parse(book.conversionJson).ocrPages) > 0) extractionMethod = "ocr"; } catch { /* Unknown conversion metadata does not establish OCR or original verification. */ } }
  if (fragment.pageNumber !== null) {
    if (!book.originalRetained || book.locatorKind !== "pdf-page" || !Number.isSafeInteger(fragment.pageNumber)) throw httpError("La cita no tiene una página física válida", 409);
    const page = (await verifiedPdfPages(book, client, cache)).get(fragment.pageNumber);
    const start = fragment.pageStartOffset, end = fragment.pageEndOffset;
    if (!page || start === null || end === null || !Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > page.text.length || end - start !== fragment.text.length || page.text.slice(start, end) !== fragment.text || fragment.startOffset !== page.startOffset + start || fragment.endOffset !== page.startOffset + end) throw httpError("La página no coincide con la cita registrada", 409);
    extractionMethod = page.method;
  } else if (book.locatorKind === "pdf-page" || fragment.pageStartOffset !== null || fragment.pageEndOffset !== null) throw httpError("La cita no tiene una ubicación de origen verificable", 409);
  const verificationBasis = book.originalRetained ? "original" as const : "retained_text" as const;
  const quoteSha256 = sha256(valid.quote), identity = [book.id, fragment.id, quoteSha256, fragment.textSha256, book.sourceSha256, fragment.pageNumber];
  const sourceKey = sha256(JSON.stringify(verificationBasis === "original" ? identity : [...identity, verificationBasis, book.retainedSha256]));
  return { ...valid, ...sourceMetadata(book), sourceKind: "library_book", verificationBasis, retainedSha256: book.retainedSha256, ordinal: fragment.ordinal, quoteSha256, textSha256: fragment.textSha256, sourceSha256: book.sourceSha256, sourceKey, pageNumber: fragment.pageNumber, locatorLabel: verificationBasis === "retained_text" ? `Texto retenido · fragmento ${fragment.ordinal}` : fragment.pageNumber === null ? fragment.locatorLabel : `Página ${fragment.pageNumber}`, href: `/biblioteca/${book.id}?fragment=${fragment.ordinal}#fragment-${fragment.ordinal}`, title: book.title, author: book.author, year: book.year, edition: book.edition, publisher: book.publisher, extractionMethod, partial: book.status !== "completed" };
}
const collectionCreateSchema = z.object({ name: z.string().trim().min(1).max(100) }).strict();
export const collectionPatchSchema = z.object({ revision: z.number().int().positive(), name: z.string().trim().min(1).max(100).optional(), bookIds: z.array(z.string().min(1).max(100)).max(BOOK_LIMITS.collectionBooks).optional(), memberIds: z.array(z.string().min(1).max(100)).max(BOOK_LIMITS.collectionMembers).optional() }).strict();
async function collectionFor(id: string, user: CausaAccessUser, client: BookClient, owned = false) { const actor = await actorFor(user, client); const collection = await client.bookShelfCollection.findFirst({ where: { id, ...(owned ? { ownerId: actor.id } : collectionAccessWhere(actor)) }, include: { owner: { select: { name: true } }, items: { where: { book: { deletedAt: null } }, select: { bookId: true }, orderBy: { createdAt: "asc" } }, members: { select: { userId: true } } } }); if (!collection) throw httpError("Colección no encontrada o sin acceso", 404); return { actor, collection }; }
function collectionView(row: Awaited<ReturnType<typeof collectionFor>>["collection"], userId: string): BookCollectionView { return { id: row.id, name: row.name, ownerId: row.ownerId, ownerName: row.owner.name, owned: row.ownerId === userId, revision: row.revision, bookIds: row.items.map(item => item.bookId), memberIds: row.ownerId === userId ? row.members.map(member => member.userId) : [], memberCount: row.members.length }; }
export async function listBookCollections(user: CausaAccessUser, client: BookClient = prisma) { const actor = await actorFor(user, client); const rows = await client.bookShelfCollection.findMany({ where: collectionAccessWhere(actor), orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 200, include: { owner: { select: { name: true } }, items: { where: { book: { deletedAt: null } }, select: { bookId: true }, orderBy: { createdAt: "asc" } }, members: { select: { userId: true } } } }); return rows.map(row => collectionView(row, actor.id)); }
export async function createBookCollection(raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) { const { name } = collectionCreateSchema.parse(raw); return bookTransaction(client, async tx => { const actor = await actorFor(user, tx); if (await tx.bookShelfCollection.count({ where: { ownerId: actor.id } }) >= BOOK_LIMITS.collections) throw httpError("Puede crear hasta 100 colecciones", 413); const row = await tx.bookShelfCollection.create({ data: { ownerId: actor.id, name } }); await writeAuditStrict({ actorId: actor.id, action: "library.collection.create", entityType: "BookShelfCollection", entityId: row.id, after: { revision: row.revision } }, tx); return { collection: collectionView((await collectionFor(row.id, actor, tx)).collection, actor.id) }; }); }
export async function readBookCollection(id: string, user: CausaAccessUser, client: BookClient = prisma) { const { actor, collection } = await collectionFor(id, user, client); return { collection: collectionView(collection, actor.id) }; }
export async function updateBookCollection(id: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = collectionPatchSchema.parse(raw);
  return bookTransaction(client, async tx => {
    const { actor, collection } = await collectionFor(id, user, tx, true), bookIds = input.bookIds && [...new Set(input.bookIds)], memberIds = input.memberIds && [...new Set(input.memberIds)].filter(id => id !== actor.id);
    if (bookIds && await tx.libraryBook.count({ where: { id: { in: bookIds }, ownerId: actor.id, deletedAt: null } }) !== bookIds.length) throw httpError("Sólo puede compartir libros de su propiedad que sigan en la biblioteca", 404);
    if (memberIds) { const users = await tx.user.findMany({ where: { id: { in: memberIds } }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } }); for (const memberId of memberIds) { const subject = users.find(u => u.id === memberId); if (!subject) throw httpError("Algún destinatario no está disponible para compartir", 404); await actorFor(subject, tx); } }
    const changed = await tx.bookShelfCollection.updateMany({ where: { id, ownerId: actor.id, revision: input.revision }, data: { ...(input.name ? { name: input.name } : {}), revision: { increment: 1 } } }); if (!changed.count) throw httpError("La colección cambió; recargue antes de guardar", 409);
    if (bookIds) { await tx.bookShelfItem.deleteMany({ where: { collectionId: id } }); if (bookIds.length) await tx.bookShelfItem.createMany({ data: bookIds.map(bookId => ({ collectionId: id, bookId })) }); }
    if (memberIds) { await tx.bookShelfMember.deleteMany({ where: { collectionId: id } }); if (memberIds.length) await tx.bookShelfMember.createMany({ data: memberIds.map(userId => ({ collectionId: id, userId })) }); }
    await writeAuditStrict({ actorId: actor.id, action: "library.collection.update", entityType: "BookShelfCollection", entityId: id, before: { revision: collection.revision }, after: { revision: input.revision + 1, bookIds, memberIds } }, tx);
    return { collection: collectionView((await collectionFor(id, actor, tx)).collection, actor.id) };
  });
}
export async function deleteBookCollection(id: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) { const { revision } = bookRevisionSchema.parse(raw); return bookTransaction(client, async tx => { const { actor } = await collectionFor(id, user, tx, true); if (!(await tx.bookShelfCollection.deleteMany({ where: { id, ownerId: actor.id, revision } })).count) throw httpError("La colección cambió; recargue antes de retirarla", 409); await writeAuditStrict({ actorId: actor.id, action: "library.collection.remove", entityType: "BookShelfCollection", entityId: id, after: { revision } }, tx); return { deleted: true }; }); }
export const bookPreferencesPatchSchema = z.object({ libraryName: z.string().trim().min(1).max(100), shelfTheme: z.enum(["walnut", "oak", "night"]), view: z.enum(["covers", "spines"]), layout: z.enum(["mesa", "estantes", "gabinete", "galeria", "archivo", "salon"]), defaultConvertToText: z.boolean(), defaultPreserveOriginal: z.boolean(), heavyFileThresholdMb: z.number().int().min(1).max(25) }).partial().strict();
const preferenceDefaults: BookPreferences = { libraryName: "Mi biblioteca jurídica", shelfTheme: "walnut", view: "covers", layout: "mesa", defaultConvertToText: false, defaultPreserveOriginal: true, heavyFileThresholdMb: 10 };
export async function readBookPreferences(user: CausaAccessUser, client: BookClient = prisma): Promise<BookPreferences> { const actor = await actorFor(user, client), row = await client.userBookPreference.findUnique({ where: { userId: actor.id } }); return row ? { libraryName: row.libraryName, shelfTheme: row.shelfTheme as BookPreferences["shelfTheme"], view: row.view as BookPreferences["view"], layout: row.layout as BookPreferences["layout"], defaultConvertToText: row.defaultConvertToText, defaultPreserveOriginal: row.defaultPreserveOriginal, heavyFileThresholdMb: row.heavyFileThresholdMb } : { ...preferenceDefaults }; }
export async function updateBookPreferences(raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) { const patch = bookPreferencesPatchSchema.parse(raw); return bookTransaction(client, async tx => { const actor = await actorFor(user, tx), data = { ...await readBookPreferences(actor, tx), ...patch }; if (!data.defaultPreserveOriginal && !data.defaultConvertToText) throw httpError("Active la conversión a texto para dejar de conservar originales por defecto", 400); await tx.userBookPreference.upsert({ where: { userId: actor.id }, create: { userId: actor.id, ...data }, update: data }); await writeAuditStrict({ actorId: actor.id, action: "library.preferences.update", entityType: "UserBookPreference", entityId: actor.id, after: data }, tx); return { preferences: data }; }); }

export async function listBookPeople(user: CausaAccessUser, client: BookClient = prisma) { const actor = await actorFor(user, client), rows = await client.user.findMany({ where: { id: { not: actor.id } }, orderBy: [{ name: "asc" }, { id: "asc" }], take: 500, select: { id: true, name: true, role: true, capabilityGrants: true, capabilityRevokes: true } }); const { isStaff } = await import("@/lib/auth/rbac"); const { canSome } = await import("@/lib/auth/permissions"); return { people: rows.filter(row => isStaff(row.role) && canSome(row, "assistant.use")).slice(0, 200).map(row => ({ id: row.id, name: row.name })) }; }
