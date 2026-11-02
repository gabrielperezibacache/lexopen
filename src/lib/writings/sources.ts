import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { assertCausaAccess, type CausaAccessUser } from "@/lib/auth/causa-access";
import { actorFor, bookAccessWhere, bookFor } from "@/lib/books/access";
import { resolveBookCitation } from "@/lib/books/service";
import { searchBooksWithScope } from "@/lib/books/rag";
import { formatBookReference, judicialMetadataNotice } from "@/lib/books/references";
import type { BookCitation } from "@/lib/books/types";
import { sha256 } from "@/lib/evidence/fragments";
import { verifyStoredCitation, type StoredCitation } from "@/lib/knowledge/citations";
import { checkedNote } from "@/lib/hearings/service";
import { workspaceFor } from "@/lib/hearings/access";
import { storedHearingCitation, verifyHearingCitation } from "@/lib/hearings/citations";
import type { HearingCitation, HearingCitationStored } from "@/lib/hearings/types";
import type { ResolvedWritingSource, StoredWritingSource, WritingCitation, WritingSourceCandidate, WritingSourceCatalog, WritingSourceCatalogQuery, WritingSourceClient, WritingSourceInput } from "./source-types";
import { writingSourceInputSchema } from "./schemas";

const missing = () => httpError("El respaldo del escrito ya no está disponible con sus permisos actuales", 404);
const changed = () => httpError("El respaldo cambió. Vuelva a seleccionarlo antes de incorporarlo", 409);
const limits = { candidates: 20, cohort: 50, factCitations: 20, books: 100 } as const;
const unavailable = (error: unknown) => [404, 409, 413, 422].includes(Number((error as { status?: number }).status));
const unique = (values: string[]) => [...new Set(values)].slice(0, 40);
const normalized = (value: string) => value.normalize("NFC").toLocaleLowerCase("es");

async function within<T>(client: WritingSourceClient, action: (tx: WritingSourceClient) => Promise<T>): Promise<T> {
  if ("$transaction" in client && typeof client.$transaction === "function") return (client as PrismaClient).$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 });
  return action(client);
}
async function scope(causaId: string, user: CausaAccessUser, client: WritingSourceClient) {
  const actor = await actorFor(user, client);
  await assertCausaAccess(causaId, actor, { auditOverride: false }, client);
  return actor;
}
function knowledgeCitation(value: StoredCitation & { title: string; href: string; warnings: string[]; isCurrent: boolean; partial: boolean }): WritingCitation {
  const { kind, fragmentId, quote, versionId, quoteSha256, textSha256, sourceSha256, sourceKey, pageNumber } = value;
  return { kind: "knowledge", snapshot: { kind, fragmentId, quote, versionId, quoteSha256, textSha256, sourceSha256, sourceKey, pageNumber }, title: value.title, reference: value.title,
    locator: value.pageNumber ? `Página ${value.pageNumber}` : `Fragmento preparado · ${value.fragmentId.slice(-8)}`, href: value.href, quote: value.quote,
    sourceKey: value.sourceKey, sourceSha256: value.sourceSha256, textSha256: value.textSha256, quoteSha256: value.quoteSha256, pageNumber: value.pageNumber,
    verificationBasis: "original", retainedSha256: null,
    warnings: unique([...value.warnings, ...(!value.isCurrent ? ["Cita de una versión conservada anterior; revise si corresponde usarla."] : []), ...(value.partial ? ["La extracción es parcial; revise el original conservado."] : [])]) };
}
function bookCitation(value: BookCitation): WritingCitation {
  return { kind: "book", snapshot: value, title: value.title, reference: formatBookReference(value), locator: value.locatorLabel, href: value.href, quote: value.quote,
    sourceKey: value.sourceKey, sourceSha256: value.sourceSha256, textSha256: value.textSha256, quoteSha256: value.quoteSha256, pageNumber: value.pageNumber,
    verificationBasis: value.verificationBasis || "original", retainedSha256: value.retainedSha256 || null,
    warnings: unique([...(value.verificationBasis === "retained_text" ? ["Cotejado contra el texto conservado. El original no se conservó y no puede cotejarse ahora."] : []), ...(value.partial || value.extractionMethod === "ocr" ? ["Hay extracción parcial u OCR: revise la lectura y contraste el original cuando esté conservado."] : []), ...(value.sourceType && value.sourceType !== "book" ? [judicialMetadataNotice] : [])]) };
}
function hearingCitation(value: HearingCitation, workspaceId: string): WritingCitation {
  const base = value.origin === "book" ? bookCitation(value.snapshot) : knowledgeCitation({ ...value.snapshot, title: value.title, href: value.href, warnings: [], isCurrent: true, partial: false });
  return { ...base, kind: "hearing", snapshot: storedHearingCitation(value), workspaceId, reference: value.reference, locator: value.locator, warnings: unique([...base.warnings, ...(value.warning ? [value.warning] : [])]) };
}
function fingerprint(source: Omit<StoredWritingSource, "fingerprint">): string {
  return sha256(JSON.stringify([source.version, source.kind, source.input, source.originId, source.revision, source.title, source.text, source.href, source.citations.map(citation => [citation.kind, citation.snapshot, citation.workspaceId || null, citation.title, citation.reference, citation.locator, citation.href, citation.quote, citation.sourceKey, citation.sourceSha256, citation.textSha256, citation.quoteSha256, citation.pageNumber, citation.verificationBasis, citation.retainedSha256])]));
}
function finish(value: Omit<StoredWritingSource, "fingerprint">): StoredWritingSource { return { ...value, fingerprint: fingerprint(value) }; }
function safeHref(value: string) { return value.startsWith("/") && !value.startsWith("//") && !/[\r\n]/.test(value); }
function validateStored(value: StoredWritingSource) {
  try {
    if (!value || value.version !== 1 || !["fact", "note", "book"].includes(value.kind) || !writingSourceInputSchema.safeParse(value.input).success || value.input.kind !== value.kind || typeof value.originId !== "string" || typeof value.title !== "string" || value.title.length > 500 || typeof value.text !== "string" || value.text.length > 25_000 || typeof value.href !== "string" || !safeHref(value.href) || !Array.isArray(value.citations) || value.citations.length > limits.factCitations || value.citations.some(c => !c || !["knowledge", "book", "hearing"].includes(c.kind) || !c.snapshot || typeof c.quote !== "string" || c.quote.length > 10_000 || typeof c.href !== "string" || !safeHref(c.href) || !Array.isArray(c.warnings) || c.warnings.some(w => typeof w !== "string") || ![c.sourceKey, c.sourceSha256, c.textSha256, c.quoteSha256].every(hash => typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash))) || !Array.isArray(value.warnings) || value.warnings.some(w => typeof w !== "string") || value.warnings.length > 40 || value.fingerprint !== fingerprint(value)) throw changed();
  } catch { throw changed(); }
}
function excerpt(value: string) { const end = Math.min(value.length, 1800); return value.slice(0, end < value.length && /[\uD800-\uDBFF]/.test(value[end - 1]) ? end - 1 : end); }
async function capture(causaId: string, input: WritingSourceInput, actor: CausaAccessUser, client: WritingSourceClient, cache: Map<string, unknown>, checkRevision: boolean): Promise<StoredWritingSource> {
  if (input.kind === "fact") {
    const row = await client.caseFact.findFirst({ where: { id: input.factId, causaId }, include: { citations: { orderBy: { id: "asc" }, take: limits.factCitations + 1 } } });
    if (!row || !["accepted", "proposed"].includes(row.status)) throw missing();
    if (checkRevision && row.revision !== input.revision) throw changed();
    if (!row.citations.length) throw changed();
    if (row.citations.length > limits.factCitations) throw httpError("Este hecho supera veinte respaldos. Prepare una selección más acotada antes de incorporarlo al escrito", 413);
    const citations: WritingCitation[] = [];
    for (const reference of row.citations) {
      let stored: StoredCitation; try { stored = JSON.parse(reference.citationJson); } catch { throw changed(); }
      if (stored.sourceKey !== reference.sourceKey) throw changed();
      citations.push(knowledgeCitation(await verifyStoredCitation(stored, actor, { causaId, client, cache })));
    }
    let meta: { warnings?: unknown; inferenceReason?: unknown }; try { meta = JSON.parse(row.metadataJson); } catch { throw changed(); }
    const warnings = [row.status === "accepted" ? "Hecho revisado por un profesional; su revisión no certifica la verdad jurídica." : "Hecho propuesto: requiere revisión profesional antes de utilizarse.", ...(row.datePrecision === "ambiguous" ? ["La fecha de este hecho es ambigua; se conserva su expresión literal."] : []), ...(row.dateInferred ? ["La interpretación de la fecha fue registrada por un profesional; conserve su incertidumbre original."] : []), ...(Array.isArray(meta.warnings) ? meta.warnings.filter((w): w is string => typeof w === "string").slice(0, 20) : []), ...citations.flatMap(c => c.warnings)];
    return finish({ version: 1, kind: "fact", input: { kind: "fact", factId: row.id, revision: row.revision }, originId: row.id, revision: row.revision, title: "Hecho del expediente", text: row.statement, href: `/causas/${causaId}#conocimiento`, citations, warnings: unique(warnings) });
  }
  if (input.kind === "note") {
    await workspaceFor(causaId, input.workspaceId, actor, client);
    const { row, view } = await checkedNote(causaId, input.workspaceId, input.noteId, actor, client, cache);
    if (checkRevision && row.revision !== input.revision) throw changed();
    const citations = view.citation ? [hearingCitation(view.citation, input.workspaceId)] : [];
    const liveKinds: Record<string, string> = { observation: "observación", objection: "objeción", decision: "decisión", commitment: "compromiso" };
    const liveWarnings = row.liveKind ? [`Registro personal en vivo de ${liveKinds[row.liveKind] || "audiencia"}; no acredita por sí mismo una actuación judicial.`, ...(Number.isSafeInteger(row.liveElapsedSeconds) && row.liveElapsedSeconds! >= 0 ? [`Tiempo del control de sesión al guardar: ${row.liveElapsedSeconds} segundos. No es una marca de tiempo de la grabación.`] : [])] : [];
    return finish({ version: 1, kind: "note", input: { kind: "note", workspaceId: input.workspaceId, noteId: row.id, revision: row.revision }, originId: row.id, revision: row.revision, title: row.title, text: row.body, href: `/causas/${causaId}/audiencias?mesa=${encodeURIComponent(input.workspaceId)}&nota=${encodeURIComponent(row.id)}#note-${row.id}`, citations, warnings: unique([citations.length ? "Comentario del profesional con un pasaje asociado; la cita no verifica por sí misma todo el comentario." : "Observación personal de audiencia sin respaldo documental asociado; no es una cita verificada.", ...liveWarnings, ...citations.flatMap(c => c.warnings)]) });
  }
  const { book } = await bookFor(input.bookId, actor, client);
  const citation = bookCitation(await resolveBookCitation({ bookId: input.bookId, fragmentId: input.fragmentId, quote: input.quote }, actor, { client, cache }));
  return finish({ version: 1, kind: "book", input, originId: book.id, revision: book.revision, title: citation.title, text: citation.quote, href: citation.href, citations: [citation], warnings: [...citation.warnings] });
}

export async function captureWritingSource(causaId: string, input: WritingSourceInput, user: CausaAccessUser, client: WritingSourceClient = prisma, cache = new Map<string, unknown>()): Promise<StoredWritingSource> {
  const valid = writingSourceInputSchema.parse(input);
  return within(client, async tx => capture(causaId, valid, await scope(causaId, user, tx), tx, cache, true));
}
function compareCitation(stored: WritingCitation, fresh: WritingCitation) {
  if (stored.kind !== fresh.kind || stored.sourceKey !== fresh.sourceKey || stored.sourceSha256 !== fresh.sourceSha256 || stored.textSha256 !== fresh.textSha256 || stored.quoteSha256 !== fresh.quoteSha256 || stored.quote !== fresh.quote || stored.pageNumber !== fresh.pageNumber || stored.locator !== fresh.locator || stored.href !== fresh.href || stored.verificationBasis !== fresh.verificationBasis || stored.retainedSha256 !== fresh.retainedSha256) throw changed();
}
export async function verifyWritingSource(causaId: string, stored: StoredWritingSource, user: CausaAccessUser, client: WritingSourceClient = prisma, cache = new Map<string, unknown>()): Promise<ResolvedWritingSource> {
  validateStored(stored);
  return within(client, async tx => {
    const actor = await scope(causaId, user, tx), current = await capture(causaId, stored.input, actor, tx, cache, false);
    if (current.kind !== stored.kind || current.originId !== stored.originId || current.revision === stored.revision && (current.text !== stored.text || current.title !== stored.title)) throw changed();
    const warnings = [...stored.warnings, ...current.warnings];
    for (const citation of stored.citations) {
      let fresh: WritingCitation;
      if (citation.kind === "knowledge") fresh = knowledgeCitation(await verifyStoredCitation(citation.snapshot as StoredCitation, actor, { causaId, client: tx, cache }));
      else if (citation.kind === "book") { const value = citation.snapshot as BookCitation; fresh = bookCitation(await resolveBookCitation({ bookId: value.bookId, fragmentId: value.fragmentId, quote: value.quote }, actor, { client: tx, cache })); }
      else if (citation.kind === "hearing" && citation.workspaceId && stored.kind === "note" && stored.input.kind === "note" && citation.workspaceId === stored.input.workspaceId) { await workspaceFor(causaId, citation.workspaceId, actor, tx); fresh = hearingCitation(await verifyHearingCitation(causaId, citation.workspaceId, citation.snapshot as HearingCitationStored, actor, tx, cache), citation.workspaceId); }
      else throw changed();
      compareCitation(citation, fresh);
      warnings.push(...fresh.warnings);
      if (citation.reference !== fresh.reference) warnings.push("Los datos descriptivos de una fuente cambiaron desde su incorporación; se conserva la referencia guardada para revisión.");
    }
    if (current.revision !== stored.revision) warnings.push("El hecho, la nota o la ficha bibliográfica cambió desde su incorporación. Se conserva el texto de esta versión del escrito; revise el origen antes de usarlo.");
    return { ...stored, warnings: unique(warnings) };
  });
}

function candidate(source: StoredWritingSource): WritingSourceCandidate {
  return { input: source.input, kind: source.kind, title: source.title, text: source.text, href: source.href, review: source.kind === "book" ? "Pasaje cotejado en el material conservado" : source.kind === "fact" ? source.warnings[0] : source.citations.length ? "Nota con cita asociada" : "Observación personal sin cita documental", warnings: source.warnings, citationCount: source.citations.length };
}
/** Filters run only after the fixed cohort is authorized, so hidden text cannot influence search flags. */
export async function writingSourceCatalog(causaId: string, user: CausaAccessUser, query: WritingSourceCatalogQuery = {}, client: WritingSourceClient = prisma): Promise<WritingSourceCatalog> {
  if (query.kind && !["fact", "note", "book"].includes(query.kind) || (query.q?.length || 0) > 100 || (query.after?.length || 0) > 100 || (query.bookId?.length || 0) > 100) throw httpError("Filtro de respaldos inválido", 400);
  return within(client, async tx => {
    const actor = await scope(causaId, user, tx), kind = query.kind || "fact", cache = new Map<string, unknown>(), q = query.q?.trim() || "";
    const result: WritingSourceCatalog = { kind, candidates: [], books: [], nextAfter: null, limited: false, warnings: [], coverage: { networkRequests: 0, modelUsed: false, scope: "Hasta cincuenta registros autorizados por ventana y veinte resultados. No representa todo el expediente." } };
    if (kind === "book") {
      const books = await tx.libraryBook.findMany({ where: bookAccessWhere(actor), orderBy: [{ title: "asc" }, { id: "asc" }], take: limits.books + 1, select: { id: true, title: true, ownerId: true } });
      result.books = books.slice(0, limits.books).map(book => ({ id: book.id, title: book.title, owned: book.ownerId === actor.id })); result.limited = books.length > limits.books;
      if (result.limited) result.warnings.push("El selector muestra los primeros cien libros accesibles. La biblioteca conserva el catálogo completo.");
      result.coverage.scope = "Un libro elegido, hasta veinte pasajes preparados; la búsqueda revisa una ventana de hasta tres mil fragmentos y devuelve hasta doce coincidencias.";
      if (!query.bookId) return result;
      await bookFor(query.bookId, actor, tx);
      if (q) {
        if (q.length < 3) throw httpError("Escriba al menos tres caracteres para buscar en el libro elegido", 400);
        const { result: found } = await searchBooksWithScope({ query: q, bookIds: [query.bookId], collectionIds: [], limit: 12 }, actor, tx);
        result.candidates = found.results.map(value => ({ input: { kind: "book", bookId: value.bookId, fragmentId: value.fragmentId, quote: value.quote }, kind: "book", title: value.title, text: value.quote, href: value.href, review: "Pasaje cotejado en el material conservado", warnings: bookCitation(value).warnings, citationCount: 1 }));
        result.limited ||= found.coverage.corpusLimited; result.warnings.push(...found.warnings); return result;
      }
      const after = query.after ? Number(query.after) : -1;
      if (!Number.isSafeInteger(after) || after < -1 || after > 1_000_000) throw httpError("Cursor de pasajes inválido", 400);
      const rows = await tx.libraryBookFragment.findMany({ where: { bookId: query.bookId, ordinal: { gt: after } }, orderBy: { ordinal: "asc" }, take: limits.candidates + 1, select: { id: true, ordinal: true, text: true } });
      for (const row of rows.slice(0, limits.candidates)) { try { result.candidates.push(candidate(await capture(causaId, { kind: "book", bookId: query.bookId, fragmentId: row.id, quote: excerpt(row.text) }, actor, tx, cache, true))); } catch (error) { if (!unavailable(error)) throw error; result.warnings.push("Se omitieron pasajes cuyo acceso o material no pudo corroborarse."); } }
      if (rows.length > limits.candidates) { result.limited = true; result.nextAfter = String(rows[limits.candidates - 1].ordinal); }
      result.warnings = unique(result.warnings); return result;
    }
    let inputs: WritingSourceInput[];
    if (kind === "fact") {
      if (query.after) { const cursor = await tx.caseFact.findFirst({ where: { id: query.after, causaId, status: { in: ["proposed", "accepted"] } }, select: { id: true, revision: true } }); if (!cursor) throw missing(); await capture(causaId, { kind: "fact", factId: cursor.id, revision: cursor.revision }, actor, tx, cache, true); }
      const rows = await tx.caseFact.findMany({ where: { causaId, status: { in: ["proposed", "accepted"] }, ...(query.after ? { id: { lt: query.after } } : {}) }, orderBy: { id: "desc" }, take: limits.cohort + 1, select: { id: true, revision: true } });
      result.limited = rows.length > limits.cohort; inputs = rows.slice(0, limits.cohort).map(row => ({ kind: "fact", factId: row.id, revision: row.revision }));
    } else {
      if (query.after) { const cursor = await tx.hearingNote.findFirst({ where: { id: query.after, workspace: { causaId, ownerId: actor.id } }, select: { id: true, revision: true, workspaceId: true } }); if (!cursor) throw missing(); await capture(causaId, { kind: "note", noteId: cursor.id, workspaceId: cursor.workspaceId, revision: cursor.revision }, actor, tx, cache, true); }
      const rows = await tx.hearingNote.findMany({ where: { workspace: { causaId, ownerId: actor.id }, ...(query.after ? { id: { lt: query.after } } : {}) }, orderBy: { id: "desc" }, take: limits.cohort + 1, select: { id: true, revision: true, workspaceId: true } });
      result.limited = rows.length > limits.cohort; inputs = rows.slice(0, limits.cohort).map(row => ({ kind: "note", noteId: row.id, workspaceId: row.workspaceId, revision: row.revision }));
      result.coverage.scope = "Notas de las mesas privadas de su propiedad en esta causa. Hasta cincuenta registros por ventana y veinte resultados.";
    }
    const visible: StoredWritingSource[] = []; let omitted = false;
    for (const input of inputs) { try { visible.push(await capture(causaId, input, actor, tx, cache, true)); } catch (error) { if (!unavailable(error)) throw error; omitted = true; } }
    const matches = visible.filter(source => !q || normalized(`${source.title}\n${source.text}`).includes(normalized(q)));
    const selected = matches.slice(0, limits.candidates); result.candidates = selected.map(candidate);
    if (matches.length > limits.candidates) { result.limited = true; result.nextAfter = selected.at(-1)?.originId || null; }
    else if (result.limited) result.nextAfter = visible.at(-1)?.originId || null;
    if (omitted) result.warnings.push("Se omitieron respaldos cuyo acceso, integridad o alcance no pudo corroborarse. No se muestran sus textos ni títulos.");
    if (result.limited) result.warnings.push("El resultado está acotado. Continúe la ventana disponible o revise el apartado de origen para encontrar otros registros.");
    return result;
  });
}
