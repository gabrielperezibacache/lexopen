import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { documentReadWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { bookAccessWhere } from "@/lib/books/access";
import { rankBookFragments, searchBooksWithScope } from "@/lib/books/rag";
import { normalizeResearchText } from "@/lib/research/search";
import { writingSourceCatalog } from "@/lib/writings/sources";
import { canonicalJson } from "@/lib/command-execution";
import { resolveAltazorSources, type AltazorSourceInput } from "./resources";
import { altazorActor } from "./access";
import { httpError } from "@/lib/auth/access";
import { captureDocumentEvidence } from "@/lib/evidence/service";

const ignored = new Set("a al algo ante aqui bien como con cual cuando de del desde dime donde el ella en eres es esa ese esta este esto favor gracias hacer haz hola la las le lo los me mi mis necesito nos o para por preparar prepara puede puedes que quiero recuerda recuerdas recordarme recordar recuerdame recordemos se segun si sin sobre soy su sus te tengo ti tu tus un una unos unas y ya ayuda ayudame asistente altazor mensaje conversacion causa expediente documento archivo fuentes fuente usar usa utilizando resume resumen analiza analisis redacta redactar fundamenta fundamentar busca encuentra".split(" "));
for (const word of "documentos archivos causas expedientes resolucion resoluciones audiencia audiencias antecedente antecedentes dame hay podrias puedes estan estas revisar revisa analizar resumir".split(" ")) ignored.add(word);
function caseOverviewRequested(text: string) { return /\b(?:resume|resumir|analiza|analizar|revisa|revisar|prepara|preparar|antecedentes|expediente|resoluciones|audiencia)\b/.test(normalizeResearchText(text)); }
export function automaticContextTerms(text: string) {
  return [...new Set((normalizeResearchText(text).match(/[\p{L}\p{N}]{3,}/gu) || []).filter(term => !ignored.has(term)))].slice(0, 12);
}
export function rankConversationRecall<T extends { userText: string; assistantText: string }>(rows: T[], query: string) {
  return rankBookFragments(rows.map(row => ({ ...row, text: `${row.userText}\n${row.assistantText}` })), automaticContextTerms(query)).map(item => item.row);
}
const unavailable = (error: unknown) => [400, 403, 404, 409, 413, 422].includes(Number((error as { status?: number }).status));
function quote(text: string) { return text.slice(0, /[\uD800-\uDBFF]/.test(text[1799] || "") ? 1799 : 1800); }

/** Bounded local retrieval, followed by the exact same citation and ACL verifier as a manual selection. */
export async function automaticAltazorSources(user: CausaAccessUser, query: { text: string; causaId: string | null; documentoId?: string }, client: PrismaClient = prisma) {
  const actor = await altazorActor(user, client), terms = automaticContextTerms(query.text), inputs: AltazorSourceInput[] = [], texts = new Map<string, string>();
  if (query.documentoId && !query.causaId) throw httpError("El documento necesita una conversación de su causa.", 409);
  const add = (input: AltazorSourceInput, text = "quote" in input ? input.quote : "") => { const key = canonicalJson(input); if (inputs.length < 12 && !texts.has(key)) { inputs.push(input); texts.set(key, text); } };
  if (query.causaId) {
    const where: Prisma.DocumentoWhereInput = { AND: [documentReadWhere(actor), { causaId: query.causaId }, ...(query.documentoId ? [{ id: query.documentoId }] : [])] };
    const documents = await client.documento.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 100, select: { id: true, evidenceResource: { select: { versions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { id: true } } } } } });
    if (query.documentoId && !documents.length) throw httpError("El documento no pertenece a esta conversación o ya no está disponible.", 404);
    const mayPrepare = Boolean(query.documentoId || caseOverviewRequested(query.text));
    if (mayPrepare) for (const document of documents.slice(0, query.documentoId ? 1 : 3)) {
      if (document.evidenceResource?.versions.length) continue;
      try {
        const version = await captureDocumentEvidence(document.id, actor, client);
        document.evidenceResource = { versions: [{ id: version.id }] };
      } catch (error) {
        if (!unavailable(error)) throw error;
        if (query.documentoId) throw httpError("Este archivo todavía no tiene texto listo para analizar. Espera a que termine su procesamiento y vuelve a enviar el mensaje.", 409);
      }
    }
    if (mayPrepare && documents.length && !documents.some(document => document.evidenceResource?.versions.length)) throw httpError("Los documentos recientes todavía no tienen texto listo para analizar. Espera a que termine su procesamiento y vuelve a enviar el mensaje.", 409);
    const versionIds = documents.flatMap(document => document.evidenceResource?.versions.map(version => version.id) || []);
    if (versionIds.length && !query.documentoId && !terms.length && caseOverviewRequested(query.text)) {
      // A natural overview request needs antecedents even without subject keywords.
      // Take one exact window from each of three recent prepared originals, never a full case dump.
      const windows = await Promise.all(versionIds.slice(0, 3).map(versionId => client.documentEvidenceFragment.findFirst({ where: { versionId, version: { resource: { documento: where } } }, orderBy: { ordinal: "asc" }, select: { id: true, versionId: true, text: true } })));
      for (const fragment of windows) if (fragment) add({ kind: "document", fragmentId: fragment.id, versionId: fragment.versionId, quote: quote(fragment.text) }, fragment.text);
    } else if (versionIds.length && (terms.length || query.documentoId)) {
      const fragments = await client.documentEvidenceFragment.findMany({ where: { versionId: { in: versionIds }, version: { resource: { documento: where } } }, orderBy: [{ versionId: "asc" }, { ordinal: "asc" }], take: 3000, select: { id: true, versionId: true, text: true } });
      const ranked = terms.length ? rankBookFragments(fragments, terms).slice(0, 3).map(item => item.row) : fragments.slice(0, 3);
      const found = ranked.length || !query.documentoId ? ranked : fragments.slice(0, 3);
      for (const fragment of found) add({ kind: "document", fragmentId: fragment.id, versionId: fragment.versionId, quote: quote(fragment.text) }, fragment.text);
    }
    if (terms.length && !query.documentoId) for (const kind of ["fact", "note"] as const) {
      const catalog = await writingSourceCatalog(query.causaId, actor, { kind }, client);
      const found = rankBookFragments(catalog.candidates, terms)[0]; if (found) add(found.row.input, found.row.text);
    }
  }
  if (terms.length && !query.documentoId) {
    const books = await client.libraryBook.findMany({ where: bookAccessWhere(actor), orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 20, select: { id: true } });
    if (books.length) {
      const found = await searchBooksWithScope({ query: terms.join(" "), bookIds: books.map(book => book.id), collectionIds: [], limit: 3 }, actor, client);
      for (const citation of found.result.results) add({ kind: "book", bookId: citation.bookId, fragmentId: citation.fragmentId, quote: citation.quote });
    }
    const legal = await client.legalSource.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 100, select: { versions: { orderBy: [{ retrievedAt: "desc" }, { id: "desc" }], take: 1, select: { id: true } } } });
    const versionIds = legal.flatMap(source => source.versions.map(version => version.id));
    if (versionIds.length) {
      const fragments = await client.legalSourceFragment.findMany({ where: { versionId: { in: versionIds } }, orderBy: [{ versionId: "asc" }, { ordinal: "asc" }], take: 3000, select: { id: true, versionId: true, text: true } });
      for (const { row } of rankBookFragments(fragments, terms).slice(0, 3)) add({ kind: "legal", fragmentId: row.id, versionId: row.versionId, quote: quote(row.text) }, row.text);
    }
  }
  const verified: AltazorSourceInput[] = [];
  const ranked = terms.length && !query.documentoId ? rankBookFragments(inputs.map(input => ({ input, text: texts.get(canonicalJson(input)) || "" })), terms).map(item => item.row.input) : inputs;
  for (const input of ranked) {
    if (verified.length === 4) break;
    try { await resolveAltazorSources(actor, [input], { causaId: query.causaId, client }); verified.push(input); }
    catch (error) { if (!unavailable(error)) throw error; }
  }
  if (query.documentoId && !verified.length) throw httpError("No hay pasajes listos de este archivo. Revisa su procesamiento y vuelve a enviar el mensaje.", 409);
  return verified;
}
