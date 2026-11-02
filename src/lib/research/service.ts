import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import { causaAccessWhere, documentReadWhere, siteAccessWhere, siteFileReadWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { getObject, putObject, MAX_STORAGE_OBJECT_BYTES } from "@/lib/storage";
import { MAX_EVIDENCE_TEXT, sha256, splitEvidenceText, verifyEvidencePageBinding, verifyEvidenceQuote } from "@/lib/evidence/fragments";
import { evidenceResourceReadWhere, evidenceFragmentHref } from "@/lib/evidence/service";
import { resolveCitation } from "@/lib/knowledge/citations";
import { resolveLibraryScope, libraryScopeStillAuthorized, type LibrarySelection } from "@/lib/knowledge/library";
import { validatePublicLegalSourceUrl } from "./sources";
import type { FetchedLegalSource } from "./source-types";
import { RESEARCH_LIMITS, RESEARCH_SOURCE_KINDS, rankResearchText, researchQuerySchema, researchTerms, type ResearchQuery, type ResearchSourceKind } from "./search";

type ResearchClient = Prisma.TransactionClient;
export type LegalSourceImport = FetchedLegalSource & { acquisitionMethod?: "retrieved" | "manual" };
export type ResearchCitation = {
  id: string; kind: "legal" | "document"; sourceKind: ResearchSourceKind | "case_document" | "space_file";
  title: string; organism: string | null; url: string | null; versionId: string; fragmentId: string;
  documentId: string | null; siteFileId?: string | null; siteId?: string | null; quote: string; textSha256: string; sourceSha256: string; href: string;
  pageNumber: number | null; extractionMethod: string | null; partial: boolean; publishedAt: string | null; effectiveFrom: string | null;
  effectiveTo: string | null; retrievedAt: string; acquisitionMethod: string;
  matchedTerms: string[]; score: number;
};
export type ResearchResult = {
  id: string; query: string; status: "completed" | "abstained"; answerMode: "extractive";
  scope: { causaId: string | null; documentIds: string[]; sourceKinds: ResearchSourceKind[]; selectedDocumentIds: string[] | null; siteId?: string; siteFileIds?: string[]; selectedSiteFileIds?: string[] | null; librarySelections?: LibrarySelection[]; libraryOnly?: boolean };
  summary: string; results: ResearchCitation[]; warnings: string[];
  coverage: {
    sourceKinds: ResearchSourceKind[]; sourcesByKind: Record<ResearchSourceKind, number>;
    legalSourcesAvailable: number; legalSourcesSearched: number; documentsAvailable: number;
    documentsSearched: number; documentsWithoutEvidence: number; documentsWithPartialEvidence: number; legalCandidates: number;
    siteFilesAvailable?: number; siteFilesSearched?: number; siteFilesWithoutEvidence?: number; siteFilesWithPartialEvidence?: number; documentCandidates: number; resultsLimited: boolean; corpusLimited: boolean;
    libraryCollections?: number; libraryVersionsSearched?: number; libraryItemsUnavailable?: number; libraryOnly?: boolean; terms: string[]; searchedAt: string; networkRequests: 0; modelUsed: false;
  };
};
type StoredScope = { causaId?: string; documentIds: string[]; sourceKinds: ResearchSourceKind[]; selectedDocumentIds?: string[] | null; siteId?: string; siteFileIds?: string[]; selectedSiteFileIds?: string[] | null; librarySelections?: LibrarySelection[]; libraryOnly?: boolean };

async function actorFor(user: CausaAccessUser, tx: ResearchClient) {
  const actor = await tx.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
  if (!actor || !isStaff(actor.role) || !canSome(actor, "assistant.use")) throw httpError("No tiene permiso para investigar fuentes", 403);
  return actor;
}
async function transaction<T>(client: PrismaClient, run: (tx: ResearchClient) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try { return await client.$transaction(run, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 }); }
    catch (error) {
      if (attempt >= 3 || !(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2034", "P2002"].includes(error.code)) throw error;
    }
  }
}
function dateOrNull(value: Date | undefined | null) {
  if (!value) return null;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime())) throw httpError("Fecha de fuente inválida", 400);
  return value;
}
const iso = (value: Date | null | undefined) => value?.toISOString() || null;
function metadata(value: string): { warnings: string[]; acquisitionMethod?: string; partial?: boolean } {
  try {
    const parsed = JSON.parse(value);
    return { warnings: Array.isArray(parsed.coverageWarnings) ? parsed.coverageWarnings.filter((v: unknown): v is string => typeof v === "string").slice(0, 20) : [], acquisitionMethod: parsed.acquisitionMethod, partial: Boolean(parsed.partial) };
  } catch { return { warnings: ["Los metadatos de una fuente no pudieron verificarse"] }; }
}

/** The original and extracted text have separate hashes; imports never replace a version. */
export async function importLegalSource(input: LegalSourceImport, user: CausaAccessUser, client: PrismaClient = prisma) {
  await actorFor(user, client);
  const canonicalUrl = validatePublicLegalSourceUrl(input.canonicalUrl);
  if (!RESEARCH_SOURCE_KINDS.includes(input.kind as ResearchSourceKind) || !input.title.trim() || input.title.length > 1000 || !input.organism.trim() || input.organism.length > 300) throw httpError("Metadatos de fuente inválidos", 400);
  if (!input.text.trim() || input.text.length > MAX_EVIDENCE_TEXT || !Buffer.isBuffer(input.rawBytes) || !input.rawBytes.length || input.rawBytes.length > MAX_STORAGE_OBJECT_BYTES) throw httpError("La fuente está vacía o supera el límite de importación", 413);
  const sourceSha256 = sha256(input.rawBytes), textSha256 = sha256(input.text);
  const dates = { publishedAt: dateOrNull(input.publishedAt), effectiveFrom: dateOrNull(input.effectiveFrom), effectiveTo: dateOrNull(input.effectiveTo) };
  const suppliedMetadata = { title: input.title, organism: input.organism, kind: input.kind, externalId: input.externalId || null, mimeType: input.mimeType || null, publishedAt: iso(dates.publishedAt), effectiveFrom: iso(dates.effectiveFrom), effectiveTo: iso(dates.effectiveTo) };
  const storageKey = `legal-sources/${sha256(canonicalUrl)}/${sourceSha256}`;
  await putObject({ key: storageKey, body: input.rawBytes, contentType: input.mimeType });
  const chunks = splitEvidenceText(input.text);
  const method = input.acquisitionMethod || "retrieved";
  if (!["retrieved", "manual"].includes(method)) throw httpError("Procedencia inválida", 400);
  const warnings = [...new Set((input.coverageWarnings || []).slice(0, 20).map(w => String(w).slice(0, 500)))];
  if (method === "manual") warnings.push("Texto incorporado manualmente: su coincidencia con la publicación oficial requiere revisión");
  return transaction(client, async tx => {
    const actor = await actorFor(user, tx);
    const existingSource = await tx.legalSource.findUnique({ where: { canonicalUrl } });
    const existingVersion = existingSource ? await tx.legalSourceVersion.findUnique({ where: { sourceId_sourceSha256_textSha256: { sourceId: existingSource.id, sourceSha256, textSha256 } }, select: { title: true, organism: true, kind: true, externalId: true, mimeType: true, publishedAt: true, effectiveFrom: true, effectiveTo: true } }) : null;
    if (method === "manual" && existingVersion) {
      const frozen = { title: existingVersion.title, organism: existingVersion.organism, kind: existingVersion.kind, externalId: existingVersion.externalId, mimeType: existingVersion.mimeType, publishedAt: iso(existingVersion.publishedAt), effectiveFrom: iso(existingVersion.effectiveFrom), effectiveTo: iso(existingVersion.effectiveTo) };
      if (JSON.stringify(frozen) !== JSON.stringify(suppliedMetadata)) throw httpError("Esta versión ya conserva otros metadatos. Revise la fuente o incorpore una nueva versión documental", 409);
    }
    const source = existingSource && existingVersion ? existingSource : await tx.legalSource.upsert({ where: { canonicalUrl }, create: { canonicalUrl, title: input.title, organism: input.organism, kind: input.kind, externalId: input.externalId || null }, update: { title: input.title, organism: input.organism, kind: input.kind, externalId: input.externalId || null } });
    const version = await tx.legalSourceVersion.upsert({
      where: { sourceId_sourceSha256_textSha256: { sourceId: source.id, sourceSha256, textSha256 } },
      create: { sourceId: source.id, sourceSha256, textSha256, text: input.text, sourceStorageKey: storageKey,
        title: input.title, organism: input.organism, kind: input.kind, externalId: input.externalId || null, mimeType: input.mimeType || null,
        ...dates,
        retrievedAt: dateOrNull(input.retrievedAt) || new Date(), acquisitionMethod: method,
        metadataJson: JSON.stringify({ coverageWarnings: warnings, acquisitionMethod: method, retrievalUrl: input.retrievalUrl }), fragments: { create: chunks } }, update: {},
      select: { id: true, sourceId: true, title: true, organism: true, kind: true, sourceSha256: true, textSha256: true, retrievedAt: true, acquisitionMethod: true, metadataJson: true, _count: { select: { fragments: true } } },
    });
    await writeAuditStrict({ actorId: actor.id, action: "research.source.import", entityType: "LegalSourceVersion", entityId: version.id, after: { sourceId: source.id, sourceSha256, textSha256, acquisitionMethod: version.acquisitionMethod } }, tx);
    return { ...version, canonicalUrl, warnings: metadata(version.metadataJson).warnings, href: `/jurisprudencia/fuentes/${version.id}` };
  });
}

const legalVersionSelect = { id: true, title: true, organism: true, kind: true, externalId: true, sourceSha256: true, textSha256: true, mimeType: true, publishedAt: true, effectiveFrom: true, effectiveTo: true, retrievedAt: true, acquisitionMethod: true, metadataJson: true, source: { select: { canonicalUrl: true } } } as const;
const documentVersionSelect = { id: true, sourceName: true, sourceSha256: true, createdAt: true, extractionStatus: true, locatorKind: true, metadataJson: true, resource: { select: { documentoId: true, siteFileId: true, siteFile: { select: { siteId: true } } } } } as const;

async function rankFragmentIds(tx: ResearchClient, kind: "legal" | "document", versionIds: string[], terms: string[]) {
  if (!versionIds.length) return [];
  const table = kind === "legal" ? Prisma.sql`"LegalSourceFragment"` : Prisma.sql`"DocumentEvidenceFragment"`;
  const versionTable = kind === "legal" ? Prisma.sql`"LegalSourceVersion"` : Prisma.sql`"DocumentEvidenceVersion"`;
  const title = kind === "legal" ? Prisma.sql`v."title"` : Prisma.sql`v."sourceName"`;
  const scores = terms.map(term => Prisma.sql`(CASE WHEN strpos(public.unaccent(lower(f."text")), ${term}) > 0 THEN 10 ELSE 0 END + CASE WHEN strpos(public.unaccent(lower(${title})), ${term}) > 0 THEN 3 ELSE 0 END)`);
  const score = Prisma.sql`(${Prisma.join(scores, " + ")})`;
  return tx.$queryRaw<{ id: string; matches: number }[]>(Prisma.sql`SELECT f."id", ${score} AS matches FROM ${table} f JOIN ${versionTable} v ON v."id" = f."versionId" WHERE f."versionId" IN (${Prisma.join(versionIds)}) AND ${score} > 0 ORDER BY matches DESC, f."id" ASC LIMIT ${RESEARCH_LIMITS.candidatesPerKind + 1}`);
}

/** Public corpus + an explicitly selected private scope; no model or web request occurs here. */
export async function searchResearch(user: CausaAccessUser, raw: ResearchQuery, client: PrismaClient = prisma): Promise<ResearchResult> {
  const input = researchQuerySchema.parse(raw), terms = researchTerms(input.query);
  const sourceKinds = [...new Set(input.sourceKinds || RESEARCH_SOURCE_KINDS)];
  const selectedIds = !input.libraryOnly && input.documentIds ? [...new Set(input.documentIds)] : undefined;
  const selectedFileIds = !input.libraryOnly && input.siteFileIds ? [...new Set(input.siteFileIds)] : undefined;
  return transaction(client, async tx => {
    const actor = await actorFor(user, tx);
    if (input.causaId && !await tx.causa.findFirst({ where: { AND: [{ id: input.causaId }, causaAccessWhere(actor)] }, select: { id: true } })) throw httpError("Expediente no encontrado o sin acceso", 404);
    if (input.siteId && !await tx.site.findFirst({ where: { AND: [{ id: input.siteId }, siteAccessWhere(actor)] }, select: { id: true } })) throw httpError("Espacio no encontrado o sin acceso", 404);
    const library = await resolveLibraryScope(input.libraryCollectionIds || [], actor, { causaId: input.causaId, siteId: input.siteId }, tx);
    const siteFileWhere: Prisma.SiteFileWhereInput = { AND: [siteFileReadWhere(actor), { siteId: input.siteId || "__none__" }, ...(selectedFileIds ? [{ id: { in: selectedFileIds } }] : [])] };
    const siteFileCount = input.siteId && !input.libraryOnly ? await tx.siteFile.count({ where: siteFileWhere }) : 0;
    if (selectedFileIds && selectedFileIds.length !== siteFileCount) throw httpError("Algún archivo seleccionado no existe o dejó de estar autorizado", 404);
    const siteFiles = input.siteId && !input.libraryOnly ? await tx.siteFile.findMany({ where: siteFileWhere, orderBy: { id: "asc" }, take: RESEARCH_LIMITS.documents, select: { id: true, evidenceResource: { select: { versions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { id: true, extractionStatus: true, metadataJson: true } } } } } }) : [];
    const includeDocuments = !input.libraryOnly && Boolean(input.causaId || selectedIds?.length);
    const documentWhere: Prisma.DocumentoWhereInput = { AND: [documentReadWhere(actor), ...(input.causaId ? [{ causaId: input.causaId }] : []), ...(selectedIds ? [{ id: { in: selectedIds } }] : [])] };
    const documentCount = includeDocuments ? await tx.documento.count({ where: documentWhere }) : 0;
    if (selectedIds && selectedIds.length !== documentCount) throw httpError("Algún documento seleccionado no existe o dejó de estar autorizado", 404);
    const documents = includeDocuments ? await tx.documento.findMany({ where: documentWhere, orderBy: { id: "asc" }, take: RESEARCH_LIMITS.documents, select: { id: true, evidenceResource: { select: { versions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { id: true, extractionStatus: true, metadataJson: true } } } } } }) : [];
    const caseVersionIds = documents.flatMap(doc => doc.evidenceResource?.versions.map(v => v.id) || []);
    const siteVersionIds = siteFiles.flatMap(file => file.evidenceResource?.versions.map(v => v.id) || []);
    const documentVersionIds = [...new Set([...caseVersionIds, ...siteVersionIds, ...library.documentVersionIds])];
    const resourceWhere: Prisma.DocumentResourceWhereInput = { AND: [evidenceResourceReadWhere(actor), { OR: [{ documento: documentWhere }, { siteFile: siteFileWhere }, { id: { in: library.citations.flatMap(citation => citation.resourceId ? [citation.resourceId] : []) } }] }] };
    const legalWhere = { kind: { in: sourceKinds } };
    const legalSourcesAvailable = input.libraryOnly ? 0 : await tx.legalSource.count({ where: legalWhere });
    const sources = input.libraryOnly ? [] : await tx.legalSource.findMany({ where: legalWhere, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: RESEARCH_LIMITS.legalSources, select: { id: true, kind: true, versions: { orderBy: [{ retrievedAt: "desc" }, { id: "desc" }], take: 1, select: { id: true } } } });
    const legalVersionIds = [...new Set([...sources.flatMap(source => source.versions.map(v => v.id)), ...library.legalVersionIds])];
    const legalVersionsInScope = legalVersionIds.length ? await tx.legalSourceVersion.findMany({ where: { id: { in: legalVersionIds } }, select: { id: true, kind: true } }) : [];
    const [legalRanks, documentRanks] = await Promise.all([rankFragmentIds(tx, "legal", legalVersionIds, terms), rankFragmentIds(tx, "document", documentVersionIds, terms)]);
    const legalRows = legalRanks.length ? await tx.legalSourceFragment.findMany({ where: { id: { in: legalRanks.slice(0, RESEARCH_LIMITS.candidatesPerKind).map(row => row.id) }, versionId: { in: legalVersionIds } }, select: { id: true, ordinal: true, text: true, textSha256: true, version: { select: legalVersionSelect } } }) : [];
    const documentRows = documentRanks.length ? await tx.documentEvidenceFragment.findMany({ where: { id: { in: documentRanks.slice(0, RESEARCH_LIMITS.candidatesPerKind).map(row => row.id) }, versionId: { in: documentVersionIds }, version: { resource: resourceWhere }, OR: [{ pageId: null }, { page: { version: { resource: resourceWhere } } }] }, select: { id: true, versionId: true, ordinal: true, text: true, textSha256: true, pageId: true, pageStartOffset: true, pageEndOffset: true, version: { select: documentVersionSelect }, page: { select: { pageNumber: true, method: true, status: true } } } }) : [];
    const warnings: string[] = [...library.warnings];
    const sourceWarnings = new Map<string, string[]>();
    if (documentRows.length < Math.min(documentRanks.length, RESEARCH_LIMITS.candidatesPerKind)) warnings.push("Se excluyeron fragmentos cuya localización no pudo autorizarse o verificarse");
    const citations: ResearchCitation[] = [];
    for (const row of legalRows) {
      if (!verifyEvidenceQuote(row, row.text)) { warnings.push("Se excluyó un fragmento jurídico cuya huella no coincide"); continue; }
      const version = row.version, details = metadata(version.metadataJson);
      sourceWarnings.set(version.id, details.warnings);
      citations.push({ id: `legal:${row.id}`, kind: "legal", sourceKind: version.kind as ResearchSourceKind, title: version.title, organism: version.organism, url: version.source.canonicalUrl, versionId: version.id, fragmentId: row.id, documentId: null, quote: row.text, textSha256: row.textSha256, sourceSha256: version.sourceSha256,
        href: `/jurisprudencia/fuentes/${version.id}?fragment=${row.ordinal}#fragment-${row.ordinal}`, pageNumber: null, extractionMethod: null, partial: false,
        publishedAt: iso(version.publishedAt), effectiveFrom: iso(version.effectiveFrom), effectiveTo: iso(version.effectiveTo), retrievedAt: version.retrievedAt.toISOString(), acquisitionMethod: version.acquisitionMethod, ...rankResearchText(row.text, version.title, terms) });
    }
    for (const row of documentRows) {
      if (!verifyEvidenceQuote(row, row.text) || !row.version.resource.documentoId && !row.version.resource.siteFileId) { warnings.push("Se excluyó un fragmento documental que no pudo verificarse"); continue; }
      const partial = Boolean(metadata(row.version.metadataJson).partial || ["needs_ocr", "partial", "failed"].includes(row.version.extractionStatus));
      citations.push({ id: `document:${row.id}`, kind: "document", sourceKind: row.version.resource.siteFileId ? "space_file" : "case_document", title: row.version.sourceName, organism: null, url: null, versionId: row.version.id, fragmentId: row.id, documentId: row.version.resource.documentoId, siteFileId: row.version.resource.siteFileId, siteId: row.version.resource.siteFile?.siteId, quote: row.text, textSha256: row.textSha256, sourceSha256: row.version.sourceSha256,
        href: evidenceFragmentHref(row), pageNumber: row.page?.pageNumber || null, extractionMethod: row.page?.method || null, partial,
        publishedAt: null, effectiveFrom: null, effectiveTo: null, retrievedAt: row.version.createdAt.toISOString(), acquisitionMethod: row.version.resource.siteFileId ? "space_file" : "case_document", ...rankResearchText(row.text, row.version.sourceName, terms) });
    }
    citations.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
    const limit = input.limit || 8, shortlisted = citations.slice(0, limit);
    const documentById = new Map(documentRows.map(row => [row.id, row]));
    const pageIds = [...new Set(shortlisted.flatMap(citation => {
      const row = citation.kind === "document" ? documentById.get(citation.fragmentId) : undefined;
      return row?.pageId ? [row.pageId] : [];
    }))];
    // At most one page per final result, never a 2 MB page repeated for every
    // candidate fragment. The page's own source is authorized before its text loads.
    const pageBodies = pageIds.length ? await tx.documentEvidencePage.findMany({ where: { id: { in: pageIds }, versionId: { in: documentVersionIds }, version: { resource: resourceWhere } }, select: { id: true, versionId: true, text: true, textSha256: true } }) : [];
    const pageById = new Map(pageBodies.map(page => [page.id, page]));
    const pageVerified = shortlisted.filter(citation => {
      if (citation.kind === "legal") return true;
      const row = documentById.get(citation.fragmentId);
      const page = row?.pageId ? pageById.get(row.pageId) || null : null;
      if (!row || row.version.locatorKind === "pdf-page" && !page || !verifyEvidencePageBinding({ ...row, page })) {
        warnings.push("Se excluyó una cita documental cuya página o localización no pudo verificarse");
        return false;
      }
      return true;
    });
    const results: ResearchCitation[] = [];
    const integrityCache = new Map<string, unknown>();
    for (const citation of pageVerified) {
      if (library.selections.length) {
        try {
          const verified = await resolveCitation(citation, actor, { client: tx, cache: integrityCache });
          if (verified.versionId !== citation.versionId || verified.sourceSha256 !== citation.sourceSha256 || verified.textSha256 !== citation.textSha256 || verified.href !== citation.href || verified.pageNumber !== citation.pageNumber) throw httpError("La cita no coincide con su versión", 409);
        } catch (error) {
          if (!error || typeof error !== "object" || !("status" in error) || ![404, 409].includes(Number(error.status))) throw error;
          warnings.push("Se excluyó una cita cuya versión, posiciones u original no pudieron verificarse");
          continue;
        }
      }
      results.push(citation);
    }
    const sourcesByKind = Object.fromEntries(RESEARCH_SOURCE_KINDS.map(kind => [kind, legalVersionsInScope.filter(version => version.kind === kind).length])) as Record<ResearchSourceKind, number>;
    const kindLabels: Record<ResearchSourceKind, string> = { legislation: "legislación", jurisprudence: "jurisprudencia", administrative: "documentos administrativos", doctrine: "doctrina" };
    for (const kind of sourceKinds) if (!sourcesByKind[kind]) warnings.push(`Sin fuentes incorporadas de ${kindLabels[kind]}; esta búsqueda no cubre esa clase`);
    const documentsWithoutEvidence = documents.length - caseVersionIds.length;
    const siteFilesWithoutEvidence = siteFiles.length - siteVersionIds.length;
    const siteFilesWithPartialEvidence = siteFiles.filter(file => file.evidenceResource?.versions.some(version => metadata(version.metadataJson).partial || ["needs_ocr", "partial", "failed"].includes(version.extractionStatus))).length;
    if (siteFilesWithoutEvidence) warnings.push(`${siteFilesWithoutEvidence} archivos del espacio todavía no tienen fuentes preparadas`);
    if (siteFilesWithPartialEvidence) warnings.push(`${siteFilesWithPartialEvidence} archivos del espacio tienen extracción parcial; revise sus páginas pendientes`);
    const documentsWithPartialEvidence = documents.filter(doc => doc.evidenceResource?.versions.some(version => metadata(version.metadataJson).partial || ["needs_ocr", "partial", "failed"].includes(version.extractionStatus))).length;
    if (documentsWithoutEvidence) warnings.push(`${documentsWithoutEvidence} documentos autorizados todavía no tienen fuentes preparadas`);
    if (documentsWithPartialEvidence) warnings.push(`${documentsWithPartialEvidence} documentos revisados tienen extracción parcial; la ausencia de coincidencias no descarta contenido en sus páginas pendientes`);
    const corpusLimited = documentCount > documents.length || siteFileCount > siteFiles.length || legalSourcesAvailable > sources.length;
    if (corpusLimited) warnings.push("El corpus supera el límite de esta búsqueda; acote el expediente o los documentos");
    if (legalRanks.length > RESEARCH_LIMITS.candidatesPerKind || documentRanks.length > RESEARCH_LIMITS.candidatesPerKind) warnings.push("Hay más fragmentos coincidentes que el presupuesto de recuperación");
    warnings.push("Extractos recuperados por coincidencia textual; la pertinencia y la vigencia jurídica requieren revisión profesional");
    for (const citation of results) if (citation.kind === "legal") warnings.push(...sourceWarnings.get(citation.versionId) || []);
    const searchedAt = new Date().toISOString();
    const scope: StoredScope = { causaId: input.causaId, documentIds: documents.map(doc => doc.id), sourceKinds, selectedDocumentIds: selectedIds || null, ...(input.libraryCollectionIds?.length ? { librarySelections: library.selections, libraryOnly: Boolean(input.libraryOnly) } : {}), ...(input.siteId ? { siteId: input.siteId, siteFileIds: siteFiles.map(file => file.id), selectedSiteFileIds: selectedFileIds || null } : {}) };
    const result: ResearchResult = { id: "", query: input.query, status: results.length ? "completed" : "abstained", answerMode: "extractive", scope: { causaId: input.causaId || null, documentIds: scope.documentIds, sourceKinds, selectedDocumentIds: scope.selectedDocumentIds || null, ...(scope.librarySelections ? { librarySelections: scope.librarySelections, libraryOnly: scope.libraryOnly } : {}), ...(scope.siteId ? { siteId: scope.siteId, siteFileIds: scope.siteFileIds, selectedSiteFileIds: scope.selectedSiteFileIds } : {}) }, summary: results.length ? `Se recuperaron ${results.length} fragmentos verificables. No se generó una conclusión jurídica automática.` : "No se encontró evidencia suficiente en las fuentes y documentos revisados. Incorpore fuentes o ajuste la búsqueda.", results, warnings: [...new Set(warnings)].slice(0, 30), coverage: { sourceKinds, sourcesByKind, legalSourcesAvailable, legalSourcesSearched: legalVersionIds.length, documentsAvailable: documentCount, documentsSearched: caseVersionIds.length, siteFilesAvailable: siteFileCount, siteFilesSearched: siteVersionIds.length, siteFilesWithoutEvidence, siteFilesWithPartialEvidence, documentsWithoutEvidence, documentsWithPartialEvidence, legalCandidates: Math.min(legalRanks.length, RESEARCH_LIMITS.candidatesPerKind), documentCandidates: Math.min(documentRanks.length, RESEARCH_LIMITS.candidatesPerKind), resultsLimited: citations.length > limit, corpusLimited, ...(scope.librarySelections ? { libraryCollections: library.selections.length, libraryVersionsSearched: library.legalVersionIds.length + library.documentVersionIds.length, libraryItemsUnavailable: library.itemsUnavailable, libraryOnly: Boolean(input.libraryOnly) } : {}), terms, searchedAt, networkRequests: 0, modelUsed: false } };
    const run = await tx.researchRun.create({ data: { ownerId: actor.id, causaId: input.causaId, query: input.query, scopeJson: JSON.stringify(scope), resultJson: "{}", status: result.status } });
    result.id = run.id;
    await tx.researchRun.update({ where: { id: run.id }, data: { resultJson: JSON.stringify(result) } });
    await writeAuditStrict({ actorId: actor.id, action: "research.run", entityType: "ResearchRun", entityId: run.id, after: { status: result.status, results: results.length, legalSources: legalVersionIds.length, documents: documentVersionIds.length } }, tx);
    return result;
  });
}

async function scopeStillAuthorized(scopeJson: string, actor: CausaAccessUser, tx: ResearchClient) {
  let scope: StoredScope;
  try { scope = JSON.parse(scopeJson); if (!Array.isArray(scope.documentIds) || scope.documentIds.some(id => typeof id !== "string") || scope.documentIds.length > RESEARCH_LIMITS.documents) return false; } catch { return false; }
  if (scope.causaId && !await tx.causa.findFirst({ where: { AND: [{ id: scope.causaId }, causaAccessWhere(actor)] }, select: { id: true } })) return false;
  if (scope.documentIds.length && await tx.documento.count({ where: { AND: [{ id: { in: scope.documentIds } }, documentReadWhere(actor)] } }) !== new Set(scope.documentIds).size) return false;
  if (scope.siteId) {
    if (typeof scope.siteId !== "string" || !Array.isArray(scope.siteFileIds) || scope.siteFileIds.some(id => typeof id !== "string") || scope.siteFileIds.length > RESEARCH_LIMITS.documents) return false;
    if (!await tx.site.findFirst({ where: { AND: [{ id: scope.siteId }, siteAccessWhere(actor)] }, select: { id: true } })) return false;
    if (scope.siteFileIds.length && await tx.siteFile.count({ where: { AND: [{ id: { in: scope.siteFileIds }, siteId: scope.siteId }, siteFileReadWhere(actor)] } }) !== new Set(scope.siteFileIds).size) return false;
  } else if (scope.siteFileIds?.length) return false;
  if (scope.librarySelections && !await libraryScopeStillAuthorized(scope.librarySelections, actor, { causaId: scope.causaId, siteId: scope.siteId }, tx)) return false;
  return true;
}

async function verifiedCitation(input: Pick<ResearchCitation, "kind" | "fragmentId" | "quote">, user: CausaAccessUser, tx: ResearchClient) {
  if (!["legal", "document"].includes(input.kind) || typeof input.fragmentId !== "string" || !input.fragmentId || input.fragmentId.length > 100 || typeof input.quote !== "string" || !input.quote.trim() || input.quote.length > 10_000) throw httpError("Cita inválida", 400);
  if (input.kind === "legal") {
    const row = await tx.legalSourceFragment.findUnique({ where: { id: input.fragmentId }, select: { id: true, ordinal: true, text: true, textSha256: true, versionId: true, version: { select: { sourceSha256: true } } } });
    if (!row) throw httpError("Cita no encontrada", 404);
    return { verified: verifyEvidenceQuote(row, input.quote), fragmentId: row.id, quote: input.quote, versionId: row.versionId, textSha256: row.textSha256, sourceSha256: row.version.sourceSha256, pageNumber: null, href: `/jurisprudencia/fuentes/${row.versionId}?fragment=${row.ordinal}#fragment-${row.ordinal}` };
  }
  const sourceScope = { resource: evidenceResourceReadWhere(user) };
  const row = await tx.documentEvidenceFragment.findFirst({ where: { id: input.fragmentId, version: sourceScope, OR: [{ pageId: null }, { page: { version: sourceScope } }] }, select: { id: true, ordinal: true, text: true, textSha256: true, versionId: true, pageId: true, pageStartOffset: true, pageEndOffset: true, page: { select: { versionId: true, pageNumber: true, text: true, textSha256: true } }, version: { select: { sourceSha256: true, locatorKind: true, resource: { select: { documentoId: true, siteFileId: true, siteFile: { select: { siteId: true } } } } } } } });
  if (!row || !row.version.resource.documentoId && !row.version.resource.siteFileId) throw httpError("Cita no encontrada o sin acceso", 404);
  if (row.version.locatorKind === "pdf-page" && !row.page || !verifyEvidencePageBinding(row)) throw httpError("El fragmento no coincide con su página registrada", 409);
  return { verified: verifyEvidenceQuote(row, input.quote), fragmentId: row.id, quote: input.quote, versionId: row.versionId, textSha256: row.textSha256, sourceSha256: row.version.sourceSha256, pageNumber: row.page?.pageNumber || null, href: evidenceFragmentHref(row) };
}
export async function verifyResearchCitation(input: Pick<ResearchCitation, "kind" | "fragmentId" | "quote">, user: CausaAccessUser, client: PrismaClient = prisma) {
  return transaction(client, async tx => verifiedCitation(input, await actorFor(user, tx), tx));
}
export async function readResearchRun(id: string, user: CausaAccessUser, client: PrismaClient = prisma): Promise<ResearchResult> {
  return transaction(client, async tx => {
    const actor = await actorFor(user, tx);
    const run = await tx.researchRun.findFirst({ where: { id, ownerId: actor.id } });
    if (!run || !await scopeStillAuthorized(run.scopeJson, actor, tx)) throw httpError("Investigación no encontrada o sin acceso actual", 404);
    let result: ResearchResult;
    try { result = JSON.parse(run.resultJson); if (result.id !== run.id || result.query !== run.query || !Array.isArray(result.results) || result.results.length > RESEARCH_LIMITS.results || result.results.some(c => !["legal", "document"].includes(c.kind) || typeof c.quote !== "string" || typeof c.fragmentId !== "string")) throw new Error("invalid"); } catch { throw httpError("La investigación guardada no pudo verificarse", 409); }
    const storedScope = JSON.parse(run.scopeJson) as StoredScope;
    result.scope = { causaId: storedScope.causaId || null, documentIds: storedScope.documentIds, sourceKinds: storedScope.sourceKinds, ...(storedScope.librarySelections ? { librarySelections: storedScope.librarySelections, libraryOnly: storedScope.libraryOnly } : {}), selectedDocumentIds: storedScope.selectedDocumentIds === undefined ? storedScope.documentIds.length ? storedScope.documentIds : null : storedScope.selectedDocumentIds, ...(storedScope.siteId ? { siteId: storedScope.siteId, siteFileIds: storedScope.siteFileIds, selectedSiteFileIds: storedScope.selectedSiteFileIds ?? null } : {}) };
    const integrityCache = new Map<string, unknown>();
    for (const citation of result.results) {
      const verified = storedScope.librarySelections ? { ...await resolveCitation(citation, actor, { client: tx, cache: integrityCache }), verified: true } : await verifiedCitation(citation, actor, tx);
      if (!verified.verified || verified.versionId !== citation.versionId || verified.href !== citation.href || verified.textSha256 !== citation.textSha256 || verified.sourceSha256 !== citation.sourceSha256 || verified.pageNumber !== citation.pageNumber) throw httpError("La evidencia guardada cambió o dejó de ser verificable", 409);
    }
    return result;
  });
}
export async function listResearchRuns(user: CausaAccessUser, client: PrismaClient = prisma) {
  return transaction(client, async tx => {
    const actor = await actorFor(user, tx);
    const candidates = await tx.researchRun.findMany({ where: { ownerId: actor.id }, select: { id: true, scopeJson: true, status: true, createdAt: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100 });
    const visible = [];
    for (const row of candidates) if (await scopeStillAuthorized(row.scopeJson, actor, tx)) visible.push(row);
    if (!visible.length) return [];
    return tx.researchRun.findMany({ where: { id: { in: visible.slice(0, 20).map(row => row.id) }, ownerId: actor.id }, select: { id: true, query: true, status: true, createdAt: true, causaId: true }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
  });
}

export async function listLegalSources(user: CausaAccessUser, client: PrismaClient = prisma) {
  return transaction(client, async tx => {
    await actorFor(user, tx);
    return tx.legalSource.findMany({ orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 100, select: { id: true, canonicalUrl: true, title: true, organism: true, kind: true, externalId: true, versions: { orderBy: [{ retrievedAt: "desc" }, { id: "desc" }], take: 1, select: legalVersionSelect } } });
  });
}
export async function readLegalSourceVersion(id: string, user: CausaAccessUser, query: { after?: number; q?: string } = {}, client: PrismaClient = prisma) {
  if (query.after !== undefined && (!Number.isSafeInteger(query.after) || query.after < 0) || (query.q?.length || 0) > 200) throw httpError("Filtro de fuentes inválido", 400);
  return transaction(client, async tx => {
    await actorFor(user, tx);
    const version = await tx.legalSourceVersion.findUnique({ where: { id }, select: { ...legalVersionSelect, _count: { select: { fragments: true } } } });
    if (!version) throw httpError("Fuente no encontrada", 404);
    const rows = await tx.legalSourceFragment.findMany({ where: { versionId: id, ordinal: { gt: query.after || 0 }, ...(query.q ? { text: { contains: query.q, mode: "insensitive" } } : {}) }, orderBy: { ordinal: "asc" }, take: 51, select: { id: true, ordinal: true, text: true, textSha256: true, startOffset: true, endOffset: true } });
    return { ...version, canonicalUrl: version.source.canonicalUrl, warnings: metadata(version.metadataJson).warnings, fragments: rows.slice(0, 50), nextAfter: rows.length > 50 ? rows[49].ordinal : null, originalHref: `/api/research/sources/${id}/original` };
  });
}
export async function readLegalSourceOriginal(id: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  await actorFor(user, client);
  const version = await client.legalSourceVersion.findUnique({ where: { id }, select: { sourceStorageKey: true, sourceSha256: true, mimeType: true, title: true } });
  if (!version?.sourceStorageKey) throw httpError("Original no encontrado", 404);
  const bytes = await getObject(version.sourceStorageKey);
  if (!bytes || sha256(bytes) !== version.sourceSha256) throw httpError("El original no coincide con la versión registrada", 409);
  return { bytes, mimeType: version.mimeType, name: `${version.title.slice(0, 100)}.${version.mimeType?.includes("html") ? "html" : version.mimeType?.includes("xml") ? "xml" : version.mimeType?.includes("json") ? "json" : "txt"}` };
}
