import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { documentReadWhere, siteFileReadWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { bookAccessWhere } from "@/lib/books/access";
import { readBook } from "@/lib/books/service";
import { readDocumentEvidence, readSiteFileEvidence } from "@/lib/evidence/service";
import { readLegalSourceVersion } from "@/lib/research/service";
import { hearingReadQuerySchema } from "./schemas";
import { hearingActor, unavailable, workspaceFor, type HearingClient } from "./access";
import type { HearingLocation, HearingReading, HearingSourceKind, HearingSourceOption, HearingSourceView } from "./types";
export type SourceRow = { id: string; workspaceId: string; kind: string; refId: string; locationJson: string; state: string; position: number; revision: number; deletedAt: Date | null };
export function locationFrom(json: string): HearingLocation { try { const parsed = hearingReadQuerySchema.safeParse(JSON.parse(json)); return parsed.success ? parsed.data : {}; } catch { return {}; } }
export async function sourceOption(causaId: string, kind: HearingSourceKind, refId: string, actor: CausaAccessUser, client: HearingClient): Promise<HearingSourceOption> {
  if (kind === "document") {
    const row = await client.documento.findFirst({ where: { AND: [{ id: refId, causaId }, documentReadWhere(actor)] }, select: { nombre: true, mimeType: true } });
    if (row) return { kind, refId, title: row.nombre, detail: "Documento de la causa", href: `/documentos/${refId}/fuentes` };
  } else if (kind === "site_file") {
    const row = await client.siteFile.findFirst({ where: { AND: [{ id: refId, site: { causaId } }, siteFileReadWhere(actor)] }, select: { name: true, siteId: true } });
    if (row) return { kind, refId, title: row.name, detail: "Archivo de un espacio vinculado", href: `/sites/${row.siteId}/archivos/${refId}/fuentes` };
  } else if (kind === "book") {
    const row = await client.libraryBook.findFirst({ where: { AND: [{ id: refId }, bookAccessWhere(actor)] }, select: { title: true, author: true, ownerId: true, sourceType: true } });
    if (row) return { kind, refId, title: row.title, detail: row.sourceType === "judgment" ? "Sentencia de la biblioteca" : row.sourceType === "ruling" ? "Resolución de la biblioteca" : row.ownerId === actor.id ? "Mi biblioteca" : "Colección compartida", href: `/biblioteca/${refId}` };
  } else if (kind === "legal") {
    const row = await client.legalSourceVersion.findUnique({ where: { id: refId }, select: { title: true, organism: true } });
    if (row) return { kind, refId, title: row.title, detail: row.organism || "Fuente jurídica preparada", href: `/jurisprudencia/fuentes/${refId}` };
  }
  throw unavailable();
}
export async function sourceFor(causaId: string, workspaceId: string, sourceId: string, actor: CausaAccessUser, client: HearingClient) {
  const row = await client.hearingSource.findFirst({ where: { id: sourceId, workspaceId, deletedAt: null } });
  if (!row) throw unavailable();
  const option = await sourceOption(causaId, row.kind as HearingSourceKind, row.refId, actor, client);
  return { row, option };
}
export function sourceView(row: SourceRow, option: HearingSourceOption): Extract<HearingSourceView, { available: true }> {
  return { ...option, id: row.id, available: true, revision: row.revision, state: row.state as "pending" | "reading" | "reviewed", position: row.position, location: locationFrom(row.locationJson) };
}
export async function listSourceOptions(causaId: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const { actor } = await hearingActor(causaId, user, client);
  const [documents, files, books, legal] = await Promise.all([
    client.documento.findMany({ where: { AND: [{ causaId }, documentReadWhere(actor), { OR: [{ caseAudioSource: null }, { caseAudioSource: { liveSessionId: null } }] }, { OR: [{ audioPublication: null }, { audioPublication: { audio: { liveSessionId: null } } }] }] }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 101, select: { id: true, nombre: true } }),
    client.siteFile.findMany({ where: { AND: [{ site: { causaId } }, siteFileReadWhere(actor)] }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 101, select: { id: true, name: true, siteId: true } }),
    client.libraryBook.findMany({ where: bookAccessWhere(actor), orderBy: [{ favorite: "desc" }, { createdAt: "desc" }, { id: "asc" }], take: 201, select: { id: true, title: true, ownerId: true, sourceType: true } }),
    client.legalSourceVersion.findMany({ orderBy: [{ retrievedAt: "desc" }, { id: "asc" }], take: 101, select: { id: true, title: true, organism: true } }),
  ]);
  const options: HearingSourceOption[] = [
    ...documents.slice(0,100).map(row => ({ kind: "document" as const, refId: row.id, title: row.nombre, detail: "Documento de la causa", href: `/documentos/${row.id}/fuentes` })),
    ...files.slice(0,100).map(row => ({ kind: "site_file" as const, refId: row.id, title: row.name, detail: "Archivo de un espacio vinculado", href: `/sites/${row.siteId}/archivos/${row.id}/fuentes` })),
    ...books.slice(0,200).map(row => ({ kind: "book" as const, refId: row.id, title: row.title, detail: row.sourceType === "judgment" ? "Sentencia de la biblioteca" : row.sourceType === "ruling" ? "Resolución de la biblioteca" : row.ownerId === actor.id ? "Mi biblioteca" : "Colección compartida", href: `/biblioteca/${row.id}` })),
    ...legal.slice(0,100).map(row => ({ kind: "legal" as const, refId: row.id, title: row.title, detail: row.organism || "Fuente jurídica preparada", href: `/jurisprudencia/fuentes/${row.id}` })),
  ];
  return { options, limited: documents.length > 100 || files.length > 100 || books.length > 200 || legal.length > 100 };
}
export async function readHearingSource(causaId: string, workspaceId: string, sourceId: string, user: CausaAccessUser, query: HearingLocation = {}, client: PrismaClient = prisma): Promise<HearingReading> {
  const { actor } = await workspaceFor(causaId, workspaceId, user, client), { row, option } = await sourceFor(causaId, workspaceId, sourceId, actor, client);
  const selected = hearingReadQuerySchema.parse(query), source = sourceView(row, option);
  const location = Object.keys(selected).length ? selected : locationFrom(row.locationJson);
  let reading: HearingReading;
  if (option.kind === "book") {
    const result = await readBook(row.refId, actor, { after: location.after, page: location.page }, client);
    if (location.versionId || location.page && (result.book.locatorKind !== "pdf-page" || !result.book.originalRetained || !result.pages.some(p => p.pageNumber === location.page))) throw unavailable();
    const pdf = result.book.originalRetained && result.book.locatorKind === "pdf-page", page = pdf ? location.page || result.pages[0]?.pageNumber || null : null;
    const paged = pdf && location.page === undefined && page ? await readBook(row.refId, actor, { page }, client) : result;
    reading = { source, title: result.book.title, locatorKind: result.book.locatorKind, page, pageCount: result.book.pageCount, pages: result.pages, versions: [], versionId: null, fragments: paged.fragments.map(f => ({ ...f, locator: f.locatorLabel })), nextAfter: paged.nextAfter, originalHref: `/api/books/${row.refId}/${result.book.originalRetained ? "original" : "text"}`, imageHref: pdf && page ? `/api/books/${row.refId}/pages/${page}` : null, prepareHref: null, warnings: [...(!result.book.originalRetained ? ["El original no se conservó. El cotejo se realiza contra el texto retenido, sin páginas físicas."] : []), ...(result.book.status !== "completed" ? ["Extracción parcial: revise las páginas sin texto y el original conservado."] : [])] };
  } else if (option.kind === "legal") {
    if (location.page || location.versionId && location.versionId !== row.refId) throw unavailable();
    const result = await readLegalSourceVersion(row.refId, actor, { after: location.after }, client);
    reading = { source, title: result.title, locatorKind: "text-offset", page: null, pageCount: null, pages: [], versions: [], versionId: row.refId, fragments: result.fragments.map(f => ({ ...f, locator: `Fragmento ${f.ordinal}`, pageNumber: null })), nextAfter: result.nextAfter, originalHref: result.originalHref, imageHref: null, prepareHref: null, warnings: result.warnings };
  } else {
    const file = option.kind === "site_file" ? await client.siteFile.findUnique({ where: { id: row.refId }, select: { siteId: true } }) : null;
    const result = option.kind === "document" ? await readDocumentEvidence(row.refId, actor, location, client) : file ? await readSiteFileEvidence(file.siteId, row.refId, actor, location, client) : null;
    if (!result) throw unavailable();
    const version = result.versions.find(v => v.id === result.selectedVersionId), page = result.selectedPageNumber;
    reading = { source, title: option.title, locatorKind: version?.locatorKind || "text-offset", page, pageCount: version?.pageCount || null, pages: result.pages, versions: result.versions.map(v => ({ id: v.id, label: `${new Date(v.createdAt).toLocaleDateString("es-CL")} · ${v.sourceSha256.slice(0,10)}` })), versionId: result.selectedVersionId, fragments: result.fragments.map(f => ({ id: f.id, ordinal: f.ordinal, text: f.text, pageNumber: f.pageNumber, locator: f.pageNumber ? `Página ${f.pageNumber} · fragmento ${f.ordinal}` : `Fragmento ${f.ordinal}` })), nextAfter: result.nextAfter, originalHref: result.selectedVersionId ? `/api/evidence/versions/${result.selectedVersionId}/original` : option.kind === "document" ? `/api/documentos/${row.refId}/content` : file ? `/api/sites/${file.siteId}/files/${row.refId}/content` : null, imageHref: version?.locatorKind === "pdf-page" && page ? `/api/evidence/versions/${version.id}/pages/${page}` : null, prepareHref: option.kind === "document" ? `/api/documentos/${row.refId}/evidence` : `/api/sites/${file!.siteId}/files/${row.refId}/evidence`, warnings: version?.partial ? ["Extracción parcial u OCR. Contraste los pasajes con la página conservada."] : [] };
  }
  // Reads may span extraction/storage work. Recheck membership immediately before returning material.
  const current = await workspaceFor(causaId, workspaceId, actor, client); await sourceFor(causaId, workspaceId, sourceId, current.actor, client);
  if (reading.imageHref) { const params = new URLSearchParams({ page: String(reading.page) }); if (reading.versionId) params.set("versionId", reading.versionId); reading.imageHref = `/api/causas/${causaId}/hearings/${workspaceId}/sources/${sourceId}/page?${params}`; }
  if (reading.prepareHref) reading.prepareHref = `/api/causas/${causaId}/hearings/${workspaceId}/sources/${sourceId}/prepare`;
  return reading;
}
