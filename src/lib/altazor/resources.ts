import { z } from "zod";
import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { assertCausaAccess, causaAccessWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { actorFor, bookAccessWhere, bookFor } from "@/lib/books/access";
import { resolveBookCitation } from "@/lib/books/service";
import type { BookCitation } from "@/lib/books/types";
import { sha256 } from "@/lib/evidence/fragments";
import { canonicalJson } from "@/lib/command-execution";
import { resolveCitation, toStoredCitation, verifyStoredCitation, type StoredCitation } from "@/lib/knowledge/citations";
import { captureWritingSource, verifyWritingSource, writingSourceCatalog } from "@/lib/writings/sources";
import { authorizedEvidenceDocument } from "@/lib/evidence/service";
import { documentReadWhere } from "@/lib/auth/causa-access";
import type { StoredWritingSource, WritingSourceCandidate } from "@/lib/writings/source-types";

import { altazorSourceInputSchema, type AltazorSourceInput } from "./resource-input";
export { altazorSourceInputSchema, type AltazorSourceInput } from "./resource-input";
type SourceClient = PrismaClient | Prisma.TransactionClient;
type Options = { causaId?: string | null; client?: SourceClient };
/** Pin an explicitly linked, currently accessible case even outside the recent picker page. */
export async function altazorCauseOptions(user: CausaAccessUser, requestedId?: string | null, client: SourceClient = prisma) {
  const actor = await actorFor(user, client), where = causaAccessWhere(actor);
  const select = { id: true, titulo: true, rit: true } as const;
  const causes = await client.causa.findMany({ where, select, orderBy: [{ updatedAt: "desc" }, { id: "desc" }], take: 100 });
  if (!requestedId || causes.some(cause => cause.id === requestedId)) return causes;
  const requested = await client.causa.findFirst({ where: { AND: [where, { id: requestedId }] }, select });
  if (!requested) throw httpError("La causa solicitada no está disponible o ya no tiene acceso.", 404);
  return [...causes, requested];
}
type Proof = { kind: "writing"; value: StoredWritingSource } | { kind: "book"; value: BookCitation } | { kind: "legal"; value: StoredCitation };
export type AltazorSourceSnapshot = {
  version: 1; scopeKey: string; input: AltazorSourceInput; title: string; text: string; href: string;
  warnings: string[]; citations: { title: string; quote: string; href: string; locator: string; sourceKey: string; sourceSha256: string; verificationBasis: string }[];
  proofJson: string; fingerprint: string;
};
const scopeKey = (causaId?: string | null) => causaId ? `causa:${causaId}` : "personal";
const changed = () => httpError("Una fuente cambió o ya no está disponible. Vuelva a seleccionarla", 409);
export function altazorSourceFingerprint(value: Omit<AltazorSourceSnapshot, "fingerprint">) { return sha256(canonicalJson(value)); }
const fingerprint = altazorSourceFingerprint;
function finish(value: Omit<AltazorSourceSnapshot, "fingerprint">): AltazorSourceSnapshot { return { ...value, fingerprint: fingerprint(value) }; }
function citation(value: BookCitation) { return { title: value.title, quote: value.quote, href: value.href, locator: value.locatorLabel, sourceKey: value.sourceKey, sourceSha256: value.sourceSha256, verificationBasis: value.verificationBasis || "original" }; }
async function authorized(user: CausaAccessUser, options: Options) {
  const client = options.client || prisma, actor = await actorFor(user, client);
  if (options.causaId) await assertCausaAccess(options.causaId, actor, { auditOverride: false }, client);
  return { actor, client };
}
function context(refs: AltazorSourceSnapshot[]) {
  return refs.map((source, index) => `[R${index + 1}] ${source.title}\n${source.citations.map(item => item.locator).join("; ")}\n${source.text}\n${source.warnings.join("\n")}\nOrigen: ${source.href}`).join("\n\n");
}
/** Only the server constructs proofs. Personal conversations cannot absorb case materials. */
export async function resolveAltazorSources(user: CausaAccessUser, raw: AltazorSourceInput[], options: Options = {}) {
  const inputs = z.array(altazorSourceInputSchema).max(8).parse(raw), { actor, client } = await authorized(user, options), refs: AltazorSourceSnapshot[] = [], cache = new Map<string, unknown>();
  for (const input of inputs) {
    if (options.causaId && input.kind !== "legal") {
      const value = await captureWritingSource(options.causaId, input, actor, client, cache);
      refs.push(finish({ version: 1, scopeKey: scopeKey(options.causaId), input, title: value.title, text: value.text, href: value.href, warnings: value.warnings, citations: value.citations.map(item => ({ title: item.title, quote: item.quote, href: item.href, locator: item.locator, sourceKey: item.sourceKey, sourceSha256: item.sourceSha256, verificationBasis: item.verificationBasis })), proofJson: JSON.stringify({ kind: "writing", value } satisfies Proof) }));
    } else if (input.kind === "book") {
      const value = await resolveBookCitation({ bookId: input.bookId, fragmentId: input.fragmentId, quote: input.quote }, actor, { client, cache });
      refs.push(finish({ version: 1, scopeKey: "personal", input, title: value.title, text: value.quote, href: value.href, warnings: [...(value.partial ? ["Extracción parcial: revise el material conservado."] : []), ...(value.verificationBasis === "retained_text" ? ["Cotejo contra texto conservado; el original no está disponible."] : [])], citations: [citation(value)], proofJson: JSON.stringify({ kind: "book", value } satisfies Proof) }));
    } else if (input.kind === "legal") {
      const value = await resolveCitation(input, actor, { client, publicOnly: true, cache });
      if (value.versionId !== input.versionId) throw changed();
      refs.push(finish({ version: 1, scopeKey: scopeKey(options.causaId), input, title: value.title, text: value.quote, href: value.href, warnings: value.warnings, citations: [{ title: value.title, quote: value.quote, href: value.href, locator: value.pageNumber ? `Página ${value.pageNumber}` : "Pasaje de la versión conservada", sourceKey: value.sourceKey, sourceSha256: value.sourceSha256, verificationBasis: "original" }], proofJson: JSON.stringify({ kind: "legal", value: toStoredCitation(value) } satisfies Proof) }));
    } else throw httpError("Seleccione una conversación de la causa para utilizar sus documentos, hechos o notas", 400);
  }
  if (context(refs).length > 32000) throw httpError("La selección excede el contexto permitido; reduzca los pasajes", 413);
  return { context: context(refs), refs };
}
export async function verifyAltazorSources(user: CausaAccessUser, refs: AltazorSourceSnapshot[], options: Options = {}) {
  if (!Array.isArray(refs) || refs.length > 8) throw changed();
  const { actor, client } = await authorized(user, options), cache = new Map<string, unknown>();
  for (const value of refs) {
    const { fingerprint: hash, ...body } = value;
    if (value.version !== 1 || value.scopeKey !== scopeKey(options.causaId) || hash !== fingerprint(body) || !altazorSourceInputSchema.safeParse(value.input).success || typeof value.proofJson !== "string" || value.proofJson.length > 150000) throw changed();
    let proof: Proof; try { proof = JSON.parse(value.proofJson); } catch { throw changed(); }
    if (proof.kind === "writing" && options.causaId) {
      await verifyWritingSource(options.causaId, proof.value, actor, client, cache);
      if (canonicalJson(value.input) !== canonicalJson(proof.value.input) || value.title !== proof.value.title || value.text !== proof.value.text || value.href !== proof.value.href) throw changed();
    }
    else if (proof.kind === "book" && !options.causaId) {
      const fresh = await resolveBookCitation({ bookId: proof.value.bookId, fragmentId: proof.value.fragmentId, quote: proof.value.quote }, actor, { client, cache });
      if (fresh.sourceKey !== proof.value.sourceKey || fresh.sourceSha256 !== proof.value.sourceSha256 || fresh.quote !== value.text || fresh.textSha256 !== proof.value.textSha256 || fresh.retainedSha256 !== proof.value.retainedSha256 || value.title !== proof.value.title || value.href !== proof.value.href || canonicalJson(value.input) !== canonicalJson({ kind: "book", bookId: proof.value.bookId, fragmentId: proof.value.fragmentId, quote: proof.value.quote })) throw changed();
    } else if (proof.kind === "legal") {
      const fresh = await verifyStoredCitation(proof.value, actor, { client, publicOnly: true, cache });
      if (value.text !== fresh.quote || value.href !== fresh.href || value.title !== fresh.title || canonicalJson(value.input) !== canonicalJson({ kind: "legal", fragmentId: fresh.fragmentId, versionId: fresh.versionId, quote: fresh.quote })) throw changed();
    }
    else throw changed();
  }
  return { context: context(refs), refs };
}

export async function altazorSourceCatalog(user: CausaAccessUser, query: { causaId?: string | null; kind?: "book" | "fact" | "note" | "document"; bookId?: string; documentoId?: string; q?: string; after?: string } = {}) {
  const { actor, client } = await authorized(user, { causaId: query.causaId });
  if (query.kind === "document") {
    if (!query.causaId) throw httpError("Elija la causa del documento", 400);
    const documents = await client.documento.findMany({ where: { AND: [{ causaId: query.causaId }, documentReadWhere(actor)] }, select: { id: true, nombre: true }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 100 });
    const candidates: WritingSourceCandidate[] = [], warnings: string[] = []; let nextAfter: string | null = null;
    if (query.documentoId) {
      const document = await authorizedEvidenceDocument(query.documentoId, actor, client);
      if (document.causaId !== query.causaId) throw httpError("El documento no pertenece a esta causa", 404);
      if (!documents.some(item => item.id === document.id)) documents.push({ id: document.id, nombre: document.nombre });
      const after = Number(query.after || -1);
      if (!Number.isSafeInteger(after) || after < -1 || after > 1_000_000) throw httpError("Ventana de pasajes inválida", 400);
      const version = await client.documentEvidenceVersion.findFirst({ where: { resource: { documentoId: document.id, siteFileId: null } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], select: { id: true } });
      if (version) {
        const rows = await client.documentEvidenceFragment.findMany({ where: { versionId: version.id, ordinal: { gt: after } }, orderBy: { ordinal: "asc" }, take: 21, select: { id: true, ordinal: true, text: true } }), cache = new Map<string, unknown>();
        for (const row of rows.slice(0,20)) {
          try {
            const value = await captureWritingSource(query.causaId, { kind: "document", fragmentId: row.id, versionId: version.id, quote: row.text.slice(0,3000) }, actor, client, cache);
            if (!query.q || `${value.title}\n${value.text}`.toLocaleLowerCase().includes(query.q.toLocaleLowerCase())) candidates.push({ input: value.input, kind: "document", title: value.title, text: value.text, href: value.href, review: "Pasaje cotejado con el documento conservado", warnings: value.warnings, citationCount: value.citations.length });
          } catch (error) { if (![403,404,409].includes(Number((error as {status?:number}).status))) throw error; warnings.push("Se omitieron pasajes que requieren volver a preparar el documento."); }
        }
        if (rows.length > 20) nextAfter = String(rows[19].ordinal);
      } else warnings.push("Prepare el texto del documento desde el expediente para poder citarlo.");
    }
    return { kind: "document", books: [], documents, candidates, nextAfter, limited: Boolean(nextAfter) || documents.length >= 100, warnings: [...new Set(warnings)], coverage: { networkRequests: 0, modelUsed: false, scope: "Un documento elegido. Veinte pasajes por ventana; el filtro busca sólo en esa ventana. Se cotejan al seleccionar y al enviar." } };
  }
  if (query.causaId) return writingSourceCatalog(query.causaId, actor, query, client);
  if (query.kind && query.kind !== "book") throw httpError("Los hechos y notas pertenecen a una causa", 400);
  const books = await client.libraryBook.findMany({ where: bookAccessWhere(actor), select: { id: true, title: true, ownerId: true }, orderBy: [{ title: "asc" }, { id: "asc" }], take: 101 });
  const candidates: WritingSourceCandidate[] = [];
  let nextAfter: string | null = null;
  if (query.bookId) {
    const { book } = await bookFor(query.bookId, actor, client);
    const after = Number(query.after || 0);
    if (!Number.isSafeInteger(after) || after < 0) throw httpError("Ubicación de lectura inválida", 400);
    const fragments = await client.libraryBookFragment.findMany({ where: { bookId: query.bookId, ordinal: { gt: after }, ...(query.q?.trim() ? { text: { contains: query.q.trim(), mode: "insensitive" } } : {}) }, orderBy: { ordinal: "asc" }, take: 21 });
    if (fragments.length > 20) nextAfter = String(fragments[19].ordinal);
    for (const fragment of fragments.slice(0,20)) {
      const quote = fragment.text.slice(0, 3000);
      candidates.push({ input: { kind: "book", bookId: query.bookId, fragmentId: fragment.id, quote }, kind: "book", title: book.title, text: quote, href: `/biblioteca/${query.bookId}?fragment=${fragment.ordinal}#fragment-${fragment.ordinal}`, review: "Pasaje preparado; se cotejará al incorporarlo", warnings: [], citationCount: 1 });
      if (candidates.length === 20) break;
    }
  }
  return { kind: "book" as const, candidates, books: books.slice(0, 100).map(book => ({ id: book.id, title: book.title, owned: book.ownerId === actor.id })), nextAfter, limited: books.length > 100 || Boolean(nextAfter), warnings: [], coverage: { networkRequests: 0, modelUsed: false, scope: "Hasta cien libros accesibles y veinte pasajes por ventana del libro elegido. La búsqueda revisa sólo ese libro." } };
}
