import { z } from "zod";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { researchTerms, normalizeResearchText } from "@/lib/research/search";
import { actorFor, bookAccessWhere, collectionAccessWhere, type BookClient } from "./access";
import { resolveBookCitation } from "./service";
import type { BookCitation } from "./types";
import { judicialMetadataNotice } from "./references";

const identifier = z.string().min(1).max(100);
export const BOOK_RAG_LIMITS = { books: 2000, collections: 10, fragmentBatch: 500, results: 12, quoteChars: 1800 } as const;
export const bookSelectionShape = { bookIds: z.array(identifier).max(20).default([]), collectionIds: z.array(identifier).max(10).default([]) };
export const bookSearchSchema = z.object({ query: z.string().trim().min(3).max(1000), ...bookSelectionShape, limit: z.number().int().min(1).max(12).default(8) }).strict().refine(input => input.bookIds.length + input.collectionIds.length > 0, { message: "Elija libros o colecciones para consultar", path: ["bookIds"] });
export type BookSelection = { bookIds: string[]; collectionIds: string[] };
export type BookScopeSnapshot = { bookIds: string[]; collections: { id: string; revision: number; bookIds: string[] }[] };
export type BookSearchResult = {
  status: "completed" | "abstained"; query: string; results: (BookCitation & { score: number })[];
  coverage: { algorithm: "bm25"; fragmentsConsidered: number; booksSearched: number; corpusLimited: boolean; networkRequests: 0; modelUsed: false };
  warnings: string[];
};

const unavailable = () => httpError("La selección de libros o colecciones ya no está disponible", 404);
/** Resolve every selected scope before looking at query terms. Shared access never becomes ownership. */
export async function resolveBookSelection(input: BookSelection, user: CausaAccessUser, client: BookClient = prisma): Promise<BookScopeSnapshot> {
  const actor = await actorFor(user, client), directIds = [...new Set(input.bookIds)].sort(), collectionIds = [...new Set(input.collectionIds)].sort();
  if (!directIds.length && !collectionIds.length || directIds.length > 20 || collectionIds.length > 10) throw httpError("Elija hasta 20 libros y diez colecciones", 400);
  const snapshot: BookScopeSnapshot = { bookIds: [...directIds], collections: [] };
  for (const id of collectionIds) {
    const collection = await client.bookShelfCollection.findFirst({ where: { AND: [{ id }, collectionAccessWhere(actor)] }, select: { id: true, revision: true, items: { orderBy: { bookId: "asc" }, take: 201, select: { bookId: true, book: { select: { ownerId: true, deletedAt: true } } } }, ownerId: true } });
    if (!collection) throw unavailable();
    if (collection.items.length > 200) throw httpError("La colección supera los 200 libros admitidos", 413);
    if (collection.items.some(item => item.book.deletedAt || item.book.ownerId !== collection.ownerId)) throw unavailable();
    const ids = collection.items.map(item => item.bookId);
    snapshot.collections.push({ id, revision: collection.revision, bookIds: ids }); snapshot.bookIds.push(...ids);
  }
  snapshot.bookIds = [...new Set(snapshot.bookIds)].sort();
  if (snapshot.bookIds.length > BOOK_RAG_LIMITS.books) throw httpError("La selección supera los 2.000 libros admitidos", 413);
  if (snapshot.bookIds.length && await client.libraryBook.count({ where: { AND: [{ id: { in: snapshot.bookIds } }, bookAccessWhere(actor)] } }) !== snapshot.bookIds.length) throw unavailable();
  return snapshot;
}
export async function assertBookScope(snapshot: BookScopeSnapshot, user: CausaAccessUser, client: BookClient = prisma) {
  if (!snapshot || !Array.isArray(snapshot.bookIds) || snapshot.bookIds.length > BOOK_RAG_LIMITS.books || snapshot.bookIds.some(id => typeof id !== "string") || !Array.isArray(snapshot.collections) || snapshot.collections.length > 10 || snapshot.collections.some(c => !c || typeof c.id !== "string" || !Number.isSafeInteger(c.revision) || !Array.isArray(c.bookIds) || c.bookIds.length > 200 || c.bookIds.some(id => typeof id !== "string"))) throw unavailable();
  const actor = await actorFor(user, client);
  if (snapshot.bookIds.length && await client.libraryBook.count({ where: { AND: [{ id: { in: snapshot.bookIds } }, bookAccessWhere(actor)] } }) !== new Set(snapshot.bookIds).size) throw unavailable();
  for (const previous of snapshot.collections) {
    const row = await client.bookShelfCollection.findFirst({ where: { AND: [{ id: previous.id }, collectionAccessWhere(actor)] }, select: { revision: true, ownerId: true, items: { orderBy: { bookId: "asc" }, take: 201, select: { bookId: true, book: { select: { ownerId: true, deletedAt: true } } } } } });
    if (!row || row.revision !== previous.revision || row.items.some(item => item.book.deletedAt || item.book.ownerId !== row.ownerId) || JSON.stringify(row.items.map(item => item.bookId)) !== JSON.stringify(previous.bookIds)) throw unavailable();
  }
}
/** Deterministic lexical retrieval. No vector service, network request, or model is involved. */
export function rankBookFragments<T extends { text: string }>(rows: T[], terms: string[]) {
  const tokens = rows.map(row => normalizeResearchText(row.text).match(/[\p{L}\p{N}]+/gu) || []);
  const frequencies = tokens.map(words => { const counts = new Map<string, number>(); for (const word of words) counts.set(word, (counts.get(word) || 0) + 1); return counts; });
  const averageLength = tokens.reduce((total, words) => total + words.length, 0) / Math.max(1, rows.length);
  const documentFrequencies = terms.map(term => frequencies.reduce((count, words) => count + Number(words.has(term)), 0));
  return rows.flatMap((row, index) => {
    let score = 0;
    terms.forEach((term, termIndex) => { const frequency = frequencies[index].get(term) || 0; if (!frequency) return; const idf = Math.log(1 + (rows.length - documentFrequencies[termIndex] + 0.5) / (documentFrequencies[termIndex] + 0.5)); score += idf * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * tokens[index].length / Math.max(1, averageLength))); });
    return score > 0 ? [{ row, score }] : [];
  }).sort((a, b) => b.score - a.score);
}
function exactExcerpt(text: string, terms: string[]) {
  if (text.length <= BOOK_RAG_LIMITS.quoteChars) return text;
  const normalized = normalizeResearchText(text), matched = terms.map(term => normalized.indexOf(term)).filter(at => at >= 0);
  let start = Math.max(0, Math.min(...matched, 0) - 150); // Prefer the full fragment opening when it fits.
  if (matched.length && Math.min(...matched) > 1500) start = Math.max(0, Math.min(...matched) - 150);
  if (start && /[\uDC00-\uDFFF]/.test(text[start])) start--;
  let end = Math.min(text.length, start + BOOK_RAG_LIMITS.quoteChars);
  if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1])) end--;
  return text.slice(start, end);
}
export async function searchBooksWithScope(raw: z.input<typeof bookSearchSchema>, user: CausaAccessUser, client: BookClient = prisma): Promise<{ result: BookSearchResult; scope: BookScopeSnapshot }> {
  const input = bookSearchSchema.parse(raw), actor = await actorFor(user, client), scope = await resolveBookSelection(input, actor, client), terms = researchTerms(input.query);
  type Row = { id: string; bookId: string; ordinal: number; text: string };
  async function* batches() {
    let after: string | undefined;
    while (scope.bookIds.length && terms.length) {
      const batch: Row[] = await client.libraryBookFragment.findMany({ where: { bookId: { in: scope.bookIds }, book: bookAccessWhere(actor) }, orderBy: [{ bookId: "asc" }, { ordinal: "asc" }, { id: "asc" }], ...(after ? { cursor: { id: after }, skip: 1 } : {}), take: BOOK_RAG_LIMITS.fragmentBatch, select: { id: true, bookId: true, ordinal: true, text: true } });
      if (!batch.length) break;
      yield batch;
      after = batch[batch.length - 1].id;
      if (batch.length < BOOK_RAG_LIMITS.fragmentBatch) break;
    }
  }
  // Two bounded passes preserve corpus-wide BM25 statistics without retaining
  // every fragment, and include matches beyond the old first-3,000 window.
  let considered = 0, totalLength = 0;
  const df = terms.map(() => 0);
  for await (const batch of batches()) for (const row of batch) {
    const words = normalizeResearchText(row.text).match(/[\p{L}\p{N}]+/gu) || [], present = new Set(words);
    considered++; totalLength += words.length;
    terms.forEach((term, index) => { if (present.has(term)) df[index]++; });
  }
  const ranked: { row: Row; score: number }[] = [];
  let scored = 0;
  for await (const batch of batches()) for (const row of batch) {
    scored++;
    const words = normalizeResearchText(row.text).match(/[\p{L}\p{N}]+/gu) || [], frequencies = new Map<string, number>();
    for (const word of words) frequencies.set(word, (frequencies.get(word) || 0) + 1);
    let score = 0;
    terms.forEach((term, index) => {
      const frequency = frequencies.get(term) || 0;
      if (frequency) score += Math.log(1 + (considered - df[index] + 0.5) / (df[index] + 0.5)) * frequency * 2.2 / (frequency + 1.2 * (0.25 + 0.75 * words.length / Math.max(1, totalLength / Math.max(1, considered))));
    });
    if (score > 0) { ranked.push({ row, score }); ranked.sort((a, b) => b.score - a.score || a.row.bookId.localeCompare(b.row.bookId) || a.row.ordinal - b.row.ordinal); if (ranked.length > BOOK_RAG_LIMITS.results * 4) ranked.pop(); }
  }
  if (scored !== considered) throw httpError("La selección cambió durante la búsqueda; vuelva a consultar", 409);
  const corpusLimited = false, cache = new Map<string, unknown>(), citations: (BookCitation & { score: number })[] = [];
  let unverifiable = false;
  for (const rankedRow of ranked.slice(0, BOOK_RAG_LIMITS.results * 4)) {
    if (citations.length >= input.limit) break;
    const { row, score } = rankedRow;
    try { const citation = await resolveBookCitation({ bookId: row.bookId, fragmentId: row.id, quote: exactExcerpt(row.text, terms) }, actor, { client, cache }); citations.push({ ...citation, score: Math.round(score * 10000) / 10000 }); }
    catch (error) { if (![404, 409, 422].includes(Number((error as { status?: number }).status))) throw error; unverifiable = true; }
  }
  await assertBookScope(scope, actor, client);
  const warnings = ["Recuperación léxica BM25 sobre texto preparado; no equivale a una búsqueda semántica ni certifica la vigencia o corrección jurídica."];
  if (unverifiable) warnings.push("Se excluyeron pasajes cuyo texto, material conservado o acceso no pudo corroborarse.");
  if (citations.some(c => c.partial)) warnings.push("Hay extracciones parciales; revise su lectura y contraste el original cuando esté conservado.");
  if (citations.some(c => c.verificationBasis === "retained_text")) warnings.push("Algunas citas se corroboran contra texto conservado; sus originales no están disponibles para cotejo.");
  if (citations.some(c => c.sourceType && c.sourceType !== "book")) warnings.push(judicialMetadataNotice);
  return { scope, result: { status: citations.length ? "completed" : "abstained", query: input.query, results: citations, coverage: { algorithm: "bm25", fragmentsConsidered: considered, booksSearched: scope.bookIds.length, corpusLimited, networkRequests: 0, modelUsed: false }, warnings } };
}
export async function searchBooks(raw: z.input<typeof bookSearchSchema>, user: CausaAccessUser, client: BookClient = prisma) { return (await searchBooksWithScope(raw, user, client)).result; }
