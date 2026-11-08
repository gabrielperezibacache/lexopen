import { normalizeIsbn, sameBibliographyWork } from "./bibliography-identity";
import { z } from "zod";
import { type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { canonicalJson } from "@/lib/command-execution";
import { sha256 } from "@/lib/evidence/fragments";
import { altazorActor, altazorTransaction } from "./access";
import { altazorId, altazorRequestId } from "./schemas";
import { bibliographyMetadataSchema, bibliographyStyleSchema, normalizeDoi, type BibliographyMetadata, type BibliographyStyle } from "./bibliography-types";
import { formatBibliography, importBibliography } from "./bibliography";
import { lookupAcademicPaper, type AcademicTransport } from "./academic-discovery-providers";
import { requireAcademicOutbound } from "./academic-discovery";

export const addBibliographySchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("remote"), requestId: altazorRequestId, provider: z.enum(["crossref", "openalex"]), identifier: z.string().trim().min(1).max(300), allowExternal: z.boolean().default(false) }).strict(),
  z.object({ kind: z.literal("book"), requestId: altazorRequestId, bookId: altazorId }).strict(),
]);
export const importBibliographySchema = z.object({ requestId: altazorRequestId, format: z.enum(["ris", "bibtex", "json"]), content: z.string().min(1).max(220_000) }).strict();
const normalizedMetadata = (input: BibliographyMetadata) => bibliographyMetadataSchema.parse({ ...input, doi: input.doi ? normalizeDoi(input.doi) : "", ...(input.isbn ? { isbn: normalizeIsbn(input.isbn) } : {}) });
type Entry = { id: string; ownerId: string; requestId: string; identifierKey: string; metadataJson: string; source: string; sourceUrl: string | null; checkedAt: Date | null; revision: number; createdAt: Date; updatedAt: Date };
async function view(row: Entry, style: BibliographyStyle, actorId: string, client: PrismaClient) {
  if (row.source === "own_book") { const bookId = row.identifierKey.replace(/^book:/, ""), book = await client.libraryBook.findFirst({ where: { id: bookId, ownerId: actorId, deletedAt: null }, select: { id: true } }); if (!book) return { id: row.id, available: false, notice: "Los metadatos del libro ya no están disponibles", revision: row.revision }; }
  const metadata = normalizedMetadata(JSON.parse(row.metadataJson));
  return { id: row.id, available: true, metadata, source: row.source, sourceUrl: row.sourceUrl, checkedAt: row.checkedAt?.toISOString() || null, revision: row.revision, formatted: formatBibliography(metadata, style), notice: row.source === "crossref" || row.source === "openalex" ? "Metadatos consultados en el registro indicado; no corroboran el contenido ni la lectura de la obra." : "Metadatos aportados por el profesional; no corroborados contra un registro externo." };
}
export async function listBibliography(user: CausaAccessUser, client: PrismaClient = prisma, style: BibliographyStyle = "apa") {
  bibliographyStyleSchema.parse(style); const actor = await altazorActor(user, client), entries = await client.altazorBibliographyEntry.findMany({ where: { ownerId: actor.id }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 200 });
  return { entries: await Promise.all(entries.map(row => view(row, style, actor.id, client))), style, notice: "Formatos deterministas con los campos disponibles. Revise nombres, datos ausentes y las reglas particulares de la revista o institución." };
}
async function insertEntries(entries: Array<{ metadata: BibliographyMetadata; source: string; sourceUrl?: string; checkedAt?: Date; key?: string; requestId: string }>, user: CausaAccessUser, client: PrismaClient) {
  return altazorTransaction(client, async tx => {
    const actor = await altazorActor(user, tx), ids: string[] = []; let reused = 0;
    for (const entry of entries) {
      const metadata = normalizedMetadata(entry.metadata), key = entry.key || (metadata.doi ? `doi:${metadata.doi}` : metadata.isbn ? `isbn:${metadata.isbn}` : metadata.openalexId ? `openalex:${metadata.openalexId}` : `import:${sha256(canonicalJson(metadata))}`), prior = await tx.altazorBibliographyEntry.findFirst({ where: { ownerId: actor.id, OR: [{ requestId: entry.requestId }, { identifierKey: key }] } });
      if (prior) { if (prior.requestId === entry.requestId && prior.identifierKey !== key) throw httpError("La clave ya corresponde a otra referencia", 409); ids.push(prior.id); reused++; continue; }
      if (entry.source !== "own_book") {
        const candidates = await tx.altazorBibliographyEntry.findMany({ where: { ownerId: actor.id, source: { not: "own_book" } }, take: 200, orderBy: { createdAt: "asc" } });
        const equivalents = candidates.filter(candidate => sameBibliographyWork(normalizedMetadata(bibliographyMetadataSchema.parse(JSON.parse(candidate.metadataJson))), metadata));
        if (equivalents.length === 1) { ids.push(equivalents[0].id); reused++; continue; }
      }
      if (await tx.altazorBibliographyEntry.count({ where: { ownerId: actor.id } }) >= 200) throw httpError("La bibliografía admite hasta doscientas referencias", 413);
      ids.push((await tx.altazorBibliographyEntry.create({ data: { ownerId: actor.id, requestId: entry.requestId, identifierKey: key, metadataJson: canonicalJson(metadata), source: entry.source, sourceUrl: entry.sourceUrl || null, checkedAt: entry.checkedAt || null } })).id);
    }
    return { ids, added: ids.length - reused, reused };
  });
}
export async function addBibliography(raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma, options: { fetch?: AcademicTransport; signal?: AbortSignal } = {}) {
  const input = addBibliographySchema.parse(raw), actor = await altazorActor(user, client);
  if (input.kind === "remote") {
    requireAcademicOutbound(input.allowExternal);
    const paper = await lookupAcademicPaper(input, options);
    return insertEntries([{ metadata: paper.metadata, source: paper.provider, sourceUrl: paper.sourceUrl, checkedAt: new Date(paper.checkedAt), requestId: input.requestId }], actor, client);
  }
  const book = await client.libraryBook.findFirst({ where: { id: input.bookId, ownerId: actor.id, deletedAt: null }, select: { id: true, title: true, author: true, year: true, publisher: true, identifier: true } }); if (!book) throw httpError("Libro propio no encontrado", 404);
  let doi = "", isbn = ""; try { doi = normalizeDoi(book.identifier); } catch { try { isbn = normalizeIsbn(book.identifier); } catch { /* Local identifier. */ } }
  const parsedYear = Number(book.year), metadata = bibliographyMetadataSchema.parse({ title: book.title, authors: book.author ? [{ name: book.author, family: "", given: "" }] : [], year: Number.isInteger(parsedYear) && parsedYear >= 1000 && parsedYear <= 2200 ? parsedYear : null, publisher: book.publisher, doi, ...(isbn ? { isbn } : {}), type: "book", warnings: ["Datos de catálogo aportados al importar el libro; no corroborados externamente."] });
  return insertEntries([{ metadata, source: "own_book", key: `book:${book.id}`, requestId: input.requestId }], actor, client);
}
export async function importBibliographyEntries(raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = importBibliographySchema.parse(raw); await altazorActor(user, client);
  let metadata: BibliographyMetadata[]; try { metadata = importBibliography(input.content, input.format).map(normalizedMetadata); } catch (error) { throw httpError(error instanceof Error ? error.message : "No se pudo leer la bibliografía", 422); }
  return insertEntries(metadata.map((value, index) => ({ metadata: value, source: "user_import", requestId: sha256(`${input.requestId}:${index}`) })), user, client);
}
export async function deleteBibliographyEntry(id: string, user: CausaAccessUser, client: PrismaClient = prisma) { const actor = await altazorActor(user, client); if (!(await client.altazorBibliographyEntry.deleteMany({ where: { id, ownerId: actor.id } })).count) throw httpError("Referencia no encontrada", 404); return { deleted: true }; }
export async function exportBibliography(user: CausaAccessUser, style: BibliographyStyle, client: PrismaClient = prisma) {
  const data = await listBibliography(user, client, style), available = data.entries.filter(entry => entry.available && "metadata" in entry);
  return { body: available.map((entry, index) => formatBibliography(entry.metadata!, style, index + 1).text).join(style === "ris" ? "\n" : "\n\n"), extension: style === "bibtex" ? "bib" : style === "ris" ? "ris" : "txt", mimeType: "text/plain; charset=utf-8", count: available.length, excluded: data.entries.length - available.length };
}
