import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { documentReadWhere, siteFileReadWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { isStaff } from "@/lib/auth/rbac";
import { processDocumentBytes, MAX_PROCESSING_BYTES } from "@/lib/document-processing";
import { getObject, putObject } from "@/lib/storage";
import { writeAuditStrict } from "@/lib/audit";
import { EVIDENCE_EXTRACTOR_VERSION, sha256, splitEvidenceText, verifyEvidencePageBinding } from "./fragments";
import { extractPdfPages, renderPdfPage } from "./pdf-pages";

type PdfEvidence = Awaited<ReturnType<typeof extractPdfPages>>;

function notFound() { return Object.assign(new Error("Fuente no encontrada o sin acceso"), { status: 404 }); }
type EvidenceClient = Prisma.TransactionClient | PrismaClient;
export async function authorizedEvidenceDocument(id: string, user: CausaAccessUser, client: EvidenceClient = prisma) {
  if (!isStaff(user.role)) throw notFound();
  const document = await client.documento.findFirst({
    where: { AND: [{ id }, documentReadWhere(user)] },
    select: { id: true, nombre: true, mimeType: true, storageKey: true, contenido: true, extractedMarkdown: true, extractionStatus: true, extractionJson: true, version: true, updatedAt: true, causaId: true },
  });
  if (!document) throw notFound();
  return document;
}

/** Scope is always inherited from exactly one live, authorized source. */
export function evidenceResourceReadWhere(user: CausaAccessUser): Prisma.DocumentResourceWhereInput {
  if (!isStaff(user.role)) return { id: "__none__" };
  return { OR: [
    { documentoId: { not: null }, siteFileId: null, documento: documentReadWhere(user) },
    { documentoId: null, siteFileId: { not: null }, siteFile: siteFileReadWhere(user) },
  ] };
}

export async function authorizedEvidenceSiteFile(siteId: string, fileId: string, user: CausaAccessUser, client: EvidenceClient = prisma) {
  if (!isStaff(user.role)) throw notFound();
  const file = await client.siteFile.findFirst({
    where: { AND: [{ id: fileId, siteId }, siteFileReadWhere(user)] },
    select: { id: true, name: true, mimeType: true, storageKey: true, contenido: true, version: true, updatedAt: true, siteId: true, site: { select: { causaId: true } } },
  });
  if (!file) throw notFound();
  return file;
}

export async function captureSiteFileEvidence(siteId: string, fileId: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const file = await authorizedEvidenceSiteFile(siteId, fileId, user, client);
  const bytes = file.storageKey ? await getObject(file.storageKey) : Buffer.from(file.contenido || "", "utf8");
  if (!bytes) throw Object.assign(new Error("No se encontró el archivo original"), { status: 409 });
  if (bytes.byteLength > MAX_PROCESSING_BYTES) throw Object.assign(new Error("El archivo supera el límite de 25 MiB"), { status: 413 });
  const isPdf = bytes.subarray(0, 5).toString("ascii") === "%PDF-" || file.mimeType === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  const pdf = isPdf ? await extractPdfPages(bytes) : undefined;
  const textFormat = file.mimeType.startsWith("text/") || /\.(txt|md|csv|json|xml|log)$/i.test(file.name);
  let plainText: string | null = null;
  if (!pdf && textFormat) {
    try {
      plainText = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      if (plainText.includes("\0")) throw new Error("binary text");
    } catch { throw Object.assign(new Error("El archivo de texto debe usar UTF-8 y no contener bytes binarios"), { status: 422 }); }
  }
  const extraction = pdf ? null : plainText !== null ? { markdown: plainText, status: "completed" as const } : await processDocumentBytes(file.name, bytes);
  const text = pdf ? pdf.pages.map(page => page.text).join("\n\n") : extraction?.markdown || "";
  if (!pdf && !text.trim()) throw Object.assign(new Error("Este formato no tiene texto extraíble. Consulte el original o incorpore una copia legible"), { status: 409 });
  const storageKey = `evidence/site-file/${encodeURIComponent(fileId)}/${sha256(bytes)}`;
  await putObject({ key: storageKey, body: bytes, contentType: pdf ? "application/pdf" : file.mimeType });
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.$transaction(async tx => {
        const current = await authorizedEvidenceSiteFile(siteId, fileId, user, tx);
        if (current.updatedAt.getTime() !== file.updatedAt.getTime() || current.version !== file.version || current.storageKey !== file.storageKey) throw Object.assign(new Error("El archivo cambió. Vuelva a preparar sus fuentes"), { status: 409 });
        const snapshot = await storeEvidenceSnapshot(tx, {
          siteFileId: fileId, sourceRevision: `${file.version}:${file.updatedAt.toISOString()}`, name: file.name, mimeType: pdf ? "application/pdf" : file.mimeType,
          bytes, text, storageKey, pdf, status: pdf ? pdf.partial ? "needs_ocr" : "completed" : extraction!.status,
          metadata: { sourceKind: "site_file", siteId, sourceFileVersion: file.version, sourceUpdatedAt: file.updatedAt.toISOString(), locator: pdf ? "pdf-page" : "text-offset", partial: pdf ? pdf.partial : extraction?.status !== "completed" },
        });
        await writeAuditStrict({ actorId: user.id, action: "site.file.evidence.capture", entityType: "SiteFile", entityId: fileId, after: { versionId: snapshot.id, sourceFileVersion: file.version, sourceSha256: snapshot.sourceSha256 } }, tx);
        return snapshot;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) continue;
      throw error;
    }
  }
}

export async function readSiteFileEvidence(siteId: string, fileId: string, user: CausaAccessUser, query: EvidenceQuery = {}, client: PrismaClient = prisma) {
  const file = await authorizedEvidenceSiteFile(siteId, fileId, user, client);
  return readResourceEvidence({ siteFileId: fileId }, { id: fileId, name: file.name, status: null, causaId: file.site.causaId, siteId }, `/sites/${siteId}/archivos/${fileId}/fuentes`, query, client);
}

export function evidenceFragmentHref(fragment: { versionId: string; ordinal: number; page?: { pageNumber: number } | null; version: { resource: { documentoId: string | null; siteFileId: string | null; siteFile: { siteId: string } | null } } }) {
  const resource = fragment.version.resource;
  const base = resource.documentoId ? `/documentos/${resource.documentoId}/fuentes` : resource.siteFileId && resource.siteFile ? `/sites/${resource.siteFile.siteId}/archivos/${resource.siteFileId}/fuentes` : null;
  if (!base) throw notFound();
  return `${base}?version=${fragment.versionId}&after=${fragment.ordinal - 1}${fragment.page ? `&page=${fragment.page.pageNumber}` : ""}#fragment-${fragment.ordinal}`;
}

export async function storeEvidenceSnapshot(client: EvidenceClient, input: {
  documentoId?: string; siteFileId?: string; name: string; mimeType?: string | null; bytes: Buffer;
  text: string; storageKey?: string | null; status: string; sourceRevision?: string; metadata?: Record<string, unknown>;
  pdf?: PdfEvidence;
}) {
  let offset = 0, ordinal = 0;
  const chunks = input.pdf ? input.pdf.pages.flatMap((page, index) => {
    const start = offset;
    offset += page.text.length + (index < input.pdf!.pages.length - 1 ? 2 : 0);
    return splitEvidenceText(page.text).map(fragment => ({ ...fragment, ordinal: ++ordinal, startOffset: start + fragment.startOffset, endOffset: start + fragment.endOffset, pageNumber: page.pageNumber, pageStartOffset: fragment.startOffset, pageEndOffset: fragment.endOffset }));
  }) : splitEvidenceText(input.text).map(fragment => ({ ...fragment, pageNumber: null, pageStartOffset: null, pageEndOffset: null }));
  if (!chunks.length && !input.pdf) throw Object.assign(new Error("Este documento aún no tiene texto para citar"), { status: 409 });
  if (Boolean(input.documentoId) === Boolean(input.siteFileId)) throw new Error("A source identity is required");
  const resource = input.documentoId
    ? await client.documentResource.upsert({ where: { documentoId: input.documentoId }, create: { documentoId: input.documentoId }, update: {} })
    : await client.documentResource.upsert({ where: { siteFileId: input.siteFileId! }, create: { siteFileId: input.siteFileId }, update: {} });
  const sourceSha256 = sha256(input.bytes);
  const textSha256 = sha256(input.text);
  const extractorVersion = input.pdf?.extractorVersion || EVIDENCE_EXTRACTOR_VERSION;
  const sourceRevision = input.sourceRevision || "legacy";
  const version = await client.documentEvidenceVersion.upsert({
    where: { resourceId_sourceSha256_textSha256_extractorVersion_sourceRevision: { resourceId: resource.id, sourceSha256, textSha256, extractorVersion, sourceRevision } },
    create: { resourceId: resource.id, sourceSha256, textSha256, extractorVersion, sourceRevision, sourceName: input.name, sourceMimeType: input.mimeType, sourceStorageKey: input.storageKey, extractedText: input.text, extractionStatus: input.status, metadataJson: JSON.stringify(input.metadata || {}), pageCount: input.pdf?.pageCount, locatorKind: input.pdf ? "pdf-page" : "text-offset",
      pages: input.pdf ? { create: input.pdf.pages.map(page => ({ pageNumber: page.pageNumber, text: page.text, textSha256: page.textSha256, method: page.method, status: page.status, reason: page.reason })) } : undefined,
      fragments: { create: chunks.map(fragment => ({ ordinal: fragment.ordinal, text: fragment.text, textSha256: fragment.textSha256, startOffset: fragment.startOffset, endOffset: fragment.endOffset, pageStartOffset: fragment.pageStartOffset, pageEndOffset: fragment.pageEndOffset })) } },
    update: {},
    select: { id: true, sourceSha256: true, textSha256: true, sourceName: true, createdAt: true, _count: { select: { fragments: true } } },
  });
  if (input.pdf) {
    const pages = await client.documentEvidencePage.findMany({ where: { versionId: version.id }, select: { id: true, pageNumber: true } });
    for (const page of pages) {
      const ordinals = chunks.filter(fragment => fragment.pageNumber === page.pageNumber).map(fragment => fragment.ordinal);
      if (ordinals.length) await client.documentEvidenceFragment.updateMany({ where: { versionId: version.id, ordinal: { in: ordinals }, pageId: null }, data: { pageId: page.id } });
    }
  }
  return version;
}

export async function captureDocumentEvidence(id: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const doc = await authorizedEvidenceDocument(id, user, client);
  if (["pending", "processing"].includes(doc.extractionStatus || "")) throw Object.assign(new Error("El documento sigue en procesamiento. Intente de nuevo al finalizar"), { status: 409 });
  let text = doc.extractedMarkdown?.trim() ? doc.extractedMarkdown : doc.contenido || "";
  const bytes = doc.storageKey ? await getObject(doc.storageKey) : Buffer.from(doc.contenido || "", "utf8");
  if (!bytes) throw Object.assign(new Error("No se encontró el archivo original"), { status: 409 });
  const isPdf = bytes.subarray(0, 5).toString("ascii") === "%PDF-" || doc.mimeType === "application/pdf" || doc.nombre.toLowerCase().endsWith(".pdf");
  const pdf = isPdf ? await extractPdfPages(bytes) : undefined;
  if (pdf) text = pdf.pages.map(page => page.text).join("\n\n");
  if (!pdf && !text.trim()) throw Object.assign(new Error("Espere a que finalice la extracción o reintente el procesamiento"), { status: 409 });
  const storageKey = `evidence/${encodeURIComponent(doc.id)}/${sha256(bytes)}`;
  await putObject({ key: storageKey, body: bytes, contentType: doc.mimeType || "text/plain" });
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.$transaction(async tx => {
        const current = await authorizedEvidenceDocument(id, user, tx);
        if (current.updatedAt.getTime() !== doc.updatedAt.getTime()) throw Object.assign(new Error("El documento cambió. Vuelva a preparar sus fuentes"), { status: 409 });
        const snapshot = await storeEvidenceSnapshot(tx, { documentoId: id, sourceRevision: `${doc.version}:${doc.updatedAt.toISOString()}`, name: doc.nombre, mimeType: pdf ? "application/pdf" : doc.mimeType, bytes, text, storageKey, pdf, status: pdf ? pdf.partial ? "needs_ocr" : "completed" : doc.extractionStatus || "text", metadata: { locator: pdf ? "pdf-page" : "text-offset", partial: pdf ? pdf.partial : doc.extractionStatus === "needs_ocr" } });
        await writeAuditStrict({ actorId: user.id, action: "document.evidence.capture", entityType: "Documento", entityId: id, after: { versionId: snapshot.id, sourceSha256: snapshot.sourceSha256 } }, tx);
        return snapshot;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) continue;
      throw error;
    }
  }
}

export type EvidenceQuery = { versionId?: string; after?: number; q?: string; page?: number };

export async function readDocumentEvidence(id: string, user: CausaAccessUser, query: EvidenceQuery = {}, client: PrismaClient = prisma) {
  const doc = await authorizedEvidenceDocument(id, user, client);
  return readResourceEvidence({ documentoId: id }, { id, name: doc.nombre, status: doc.extractionStatus, causaId: doc.causaId }, `/documentos/${id}/fuentes`, query, client);
}

async function readResourceEvidence(resourceWhere: Prisma.DocumentResourceWhereInput, document: { id: string; name: string; status: string | null; causaId: string | null; siteId?: string }, hrefBase: string, query: EvidenceQuery, client: PrismaClient) {
  const versions = await client.documentEvidenceVersion.findMany({
    where: { resource: resourceWhere }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 101, select: { id: true, sourceName: true, sourceSha256: true, createdAt: true, extractionStatus: true, metadataJson: true, pageCount: true, locatorKind: true, _count: { select: { fragments: true } } },
  });
  const versionHistoryLimited = versions.length > 100;
  if (versionHistoryLimited) versions.pop();
  let selected = query.versionId ? versions.find(v => v.id === query.versionId) : versions[0];
  if (query.versionId && !selected) {
    const older = await client.documentEvidenceVersion.findFirst({ where: { id: query.versionId, resource: resourceWhere }, select: { id: true, sourceName: true, sourceSha256: true, createdAt: true, extractionStatus: true, metadataJson: true, pageCount: true, locatorKind: true, _count: { select: { fragments: true } } } });
    if (!older) throw notFound();
    selected = older; versions.push(older);
  }
  const selectedPageNumber = query.page ?? (selected?.locatorKind === "pdf-page" ? 1 : null);
  if (selectedPageNumber && !await client.documentEvidencePage.count({ where: { versionId: selected?.id || "__none__", pageNumber: selectedPageNumber } })) throw notFound();
  const fragments = selected ? await client.documentEvidenceFragment.findMany({
    where: { versionId: selected.id, ordinal: { gt: query.after || 0 }, ...(selectedPageNumber ? { page: { pageNumber: selectedPageNumber } } : {}), ...(query.q ? { text: { contains: query.q, mode: "insensitive" } } : {}) },
    orderBy: { ordinal: "asc" }, take: 51,
    select: { id: true, ordinal: true, text: true, textSha256: true, startOffset: true, endOffset: true, pageStartOffset: true, pageEndOffset: true, page: { select: { pageNumber: true, method: true, status: true } } },
  }) : [];
  const visible = fragments.slice(0,50);
  const pages = selected ? await client.documentEvidencePage.findMany({ where: { versionId: selected.id }, orderBy: { pageNumber: "asc" }, select: { pageNumber: true, method: true, status: true, reason: true, textSha256: true } }) : [];
  return { document, versions: versions.map(({metadataJson,...v})=>({...v, partial: (()=>{try{return Boolean(JSON.parse(metadataJson).partial)}catch{return false}})()})), selectedVersionId: selected?.id || null,
    pages, selectedPageNumber, fragments: visible.map(f=>({...f, pageNumber: f.page?.pageNumber || null, href: `${hrefBase}?version=${selected!.id}&after=${f.ordinal - 1}${f.page ? `&page=${f.page.pageNumber}` : ""}#fragment-${f.ordinal}` })),
    nextAfter: fragments.length > 50 ? visible.at(-1)!.ordinal : null, versionHistoryLimited };
}

export async function authorizedEvidenceFragment(fragmentId: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const row = await client.documentEvidenceFragment.findFirst({
    where: { id: fragmentId, version: { resource: evidenceResourceReadWhere(user) } },
    select: { id: true, ordinal: true, versionId: true, text: true, textSha256: true, pageStartOffset: true, pageEndOffset: true, page: { select: { versionId: true, pageNumber: true, text: true, textSha256: true } }, version: { select: { sourceSha256: true, resource: { select: { documentoId: true, siteFileId: true, siteFile: { select: { siteId: true } } } } } } },
  });
  if (!row) throw notFound();
  if (!verifyEvidencePageBinding(row)) throw Object.assign(new Error("El fragmento no coincide con su página registrada"), { status: 409 });
  return row;
}

export async function readEvidencePageImage(versionId: string, pageNumber: number, user: CausaAccessUser) {
  const page = await prisma.documentEvidencePage.findFirst({ where: { versionId, pageNumber, version: { resource: evidenceResourceReadWhere(user) } }, select: { pageNumber: true } });
  if (!page) throw notFound();
  const original = await authorizedEvidenceOriginal(versionId, user);
  return renderPdfPage(original.bytes, page.pageNumber, { expectedSourceSha256: original.sourceSha256 });
}

export async function authorizedEvidenceOriginal(versionId: string, user: CausaAccessUser) {
  const version = await prisma.documentEvidenceVersion.findFirst({
    where: { id: versionId, resource: evidenceResourceReadWhere(user) },
    select: { sourceName: true, sourceStorageKey: true, sourceSha256: true, sourceMimeType: true, resource: { select: { documentoId: true, siteFileId: true, siteFile: { select: { siteId: true } } } } },
  });
  if (!version || !version.sourceStorageKey) throw notFound();
  const bytes = await getObject(version.sourceStorageKey);
  if (!bytes || sha256(bytes) !== version.sourceSha256) throw Object.assign(new Error("El original no coincide con la versión registrada"), { status: 409 });
  return { bytes, name: version.sourceName, mimeType: version.sourceMimeType, sourceSha256: version.sourceSha256 };
}
