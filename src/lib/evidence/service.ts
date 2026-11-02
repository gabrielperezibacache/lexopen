import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { documentReadWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { getObject, putObject } from "@/lib/storage";
import { writeAuditStrict } from "@/lib/audit";
import { EVIDENCE_EXTRACTOR_VERSION, sha256, splitEvidenceText, verifyEvidencePageBinding } from "./fragments";
import { extractPdfPages, renderPdfPage } from "./pdf-pages";

type PdfEvidence = Awaited<ReturnType<typeof extractPdfPages>>;

function notFound() { return Object.assign(new Error("Fuente no encontrada o sin acceso"), { status: 404 }); }
type EvidenceClient = Prisma.TransactionClient | PrismaClient;
export async function authorizedEvidenceDocument(id: string, user: CausaAccessUser, client: EvidenceClient = prisma) {
  const document = await client.documento.findFirst({
    where: { AND: [{ id }, documentReadWhere(user)] },
    select: { id: true, nombre: true, mimeType: true, storageKey: true, contenido: true, extractedMarkdown: true, extractionStatus: true, extractionJson: true, updatedAt: true, causaId: true },
  });
  if (!document) throw notFound();
  return document;
}

export async function storeEvidenceSnapshot(client: EvidenceClient, input: {
  documentoId: string; name: string; mimeType?: string | null; bytes: Buffer;
  text: string; storageKey?: string | null; status: string; metadata?: Record<string, unknown>;
  pdf?: PdfEvidence;
}) {
  let offset = 0, ordinal = 0;
  const chunks = input.pdf ? input.pdf.pages.flatMap((page, index) => {
    const start = offset;
    offset += page.text.length + (index < input.pdf!.pages.length - 1 ? 2 : 0);
    return splitEvidenceText(page.text).map(fragment => ({ ...fragment, ordinal: ++ordinal, startOffset: start + fragment.startOffset, endOffset: start + fragment.endOffset, pageNumber: page.pageNumber, pageStartOffset: fragment.startOffset, pageEndOffset: fragment.endOffset }));
  }) : splitEvidenceText(input.text).map(fragment => ({ ...fragment, pageNumber: null, pageStartOffset: null, pageEndOffset: null }));
  if (!chunks.length && !input.pdf) throw Object.assign(new Error("Este documento aún no tiene texto para citar"), { status: 409 });
  const resource = await client.documentResource.upsert({ where: { documentoId: input.documentoId }, create: { documentoId: input.documentoId }, update: {} });
  const sourceSha256 = sha256(input.bytes);
  const textSha256 = sha256(input.text);
  const extractorVersion = input.pdf?.extractorVersion || EVIDENCE_EXTRACTOR_VERSION;
  const version = await client.documentEvidenceVersion.upsert({
    where: { resourceId_sourceSha256_textSha256_extractorVersion: { resourceId: resource.id, sourceSha256, textSha256, extractorVersion } },
    create: { resourceId: resource.id, sourceSha256, textSha256, extractorVersion, sourceName: input.name, sourceMimeType: input.mimeType, sourceStorageKey: input.storageKey, extractedText: input.text, extractionStatus: input.status, metadataJson: JSON.stringify(input.metadata || {}), pageCount: input.pdf?.pageCount, locatorKind: input.pdf ? "pdf-page" : "text-offset",
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
  let storageKey = doc.storageKey;
  if (!storageKey || pdf) {
    storageKey = `evidence/${encodeURIComponent(doc.id)}/${sha256(bytes)}`;
    await putObject({ key: storageKey, body: bytes, contentType: doc.mimeType || "text/plain" });
  }
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.$transaction(async tx => {
        const current = await authorizedEvidenceDocument(id, user, tx);
        if (current.updatedAt.getTime() !== doc.updatedAt.getTime()) throw Object.assign(new Error("El documento cambió. Vuelva a preparar sus fuentes"), { status: 409 });
        const snapshot = await storeEvidenceSnapshot(tx, { documentoId: id, name: doc.nombre, mimeType: pdf ? "application/pdf" : doc.mimeType, bytes, text, storageKey, pdf, status: pdf ? pdf.partial ? "needs_ocr" : "completed" : doc.extractionStatus || "text", metadata: { locator: pdf ? "pdf-page" : "text-offset", partial: pdf ? pdf.partial : doc.extractionStatus === "needs_ocr" } });
        await writeAuditStrict({ actorId: user.id, action: "document.evidence.capture", entityType: "Documento", entityId: id, after: { versionId: snapshot.id, sourceSha256: snapshot.sourceSha256 } }, tx);
        return snapshot;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) continue;
      throw error;
    }
  }
}

export async function readDocumentEvidence(id: string, user: CausaAccessUser, query: { versionId?: string; after?: number; q?: string; page?: number } = {}, client: PrismaClient = prisma) {
  const doc = await client.documento.findFirst({ where: { AND: [{ id }, documentReadWhere(user)] }, select: { id: true, nombre: true, extractionStatus: true, causaId: true } });
  if (!doc) throw notFound();
  const versions = await client.documentEvidenceVersion.findMany({
    where: { resource: { documentoId: id } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 101, select: { id: true, sourceName: true, sourceSha256: true, createdAt: true, extractionStatus: true, metadataJson: true, pageCount: true, locatorKind: true, _count: { select: { fragments: true } } },
  });
  const versionHistoryLimited = versions.length > 100;
  if (versionHistoryLimited) versions.pop();
  let selected = query.versionId ? versions.find(v => v.id === query.versionId) : versions[0];
  if (query.versionId && !selected) {
    const older = await client.documentEvidenceVersion.findFirst({ where: { id: query.versionId, resource: { documentoId: id } }, select: { id: true, sourceName: true, sourceSha256: true, createdAt: true, extractionStatus: true, metadataJson: true, pageCount: true, locatorKind: true, _count: { select: { fragments: true } } } });
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
  return { document: { id, name: doc.nombre, status: doc.extractionStatus, causaId: doc.causaId }, versions: versions.map(({metadataJson,...v})=>({...v, partial: (()=>{try{return Boolean(JSON.parse(metadataJson).partial)}catch{return false}})()})), selectedVersionId: selected?.id || null,
    pages, selectedPageNumber, fragments: visible.map(f=>({...f, pageNumber: f.page?.pageNumber || null, href: `/documentos/${id}/fuentes?version=${selected!.id}&after=${f.ordinal - 1}${f.page ? `&page=${f.page.pageNumber}` : ""}#fragment-${f.ordinal}` })),
    nextAfter: fragments.length > 50 ? visible.at(-1)!.ordinal : null, versionHistoryLimited };
}

export async function authorizedEvidenceFragment(fragmentId: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const row = await client.documentEvidenceFragment.findFirst({
    where: { id: fragmentId, version: { resource: { documento: documentReadWhere(user) } } },
    select: { id: true, ordinal: true, versionId: true, text: true, textSha256: true, pageStartOffset: true, pageEndOffset: true, page: { select: { versionId: true, pageNumber: true, text: true, textSha256: true } }, version: { select: { sourceSha256: true, resource: { select: { documentoId: true } } } } },
  });
  if (!row) throw notFound();
  if (!verifyEvidencePageBinding(row)) throw Object.assign(new Error("El fragmento no coincide con su página registrada"), { status: 409 });
  return row;
}

export async function readEvidencePageImage(versionId: string, pageNumber: number, user: CausaAccessUser) {
  const page = await prisma.documentEvidencePage.findFirst({ where: { versionId, pageNumber, version: { resource: { documento: documentReadWhere(user) } } }, select: { pageNumber: true } });
  if (!page) throw notFound();
  const original = await authorizedEvidenceOriginal(versionId, user);
  return renderPdfPage(original.bytes, page.pageNumber, { expectedSourceSha256: original.sourceSha256 });
}

export async function authorizedEvidenceOriginal(versionId: string, user: CausaAccessUser) {
  const version = await prisma.documentEvidenceVersion.findFirst({
    where: { id: versionId, resource: { documento: documentReadWhere(user) } },
    select: { sourceName: true, sourceStorageKey: true, sourceSha256: true, sourceMimeType: true, resource: { select: { documentoId: true } } },
  });
  if (!version?.resource.documentoId || !version.sourceStorageKey) throw notFound();
  const bytes = await getObject(version.sourceStorageKey);
  if (!bytes || sha256(bytes) !== version.sourceSha256) throw Object.assign(new Error("El original no coincide con la versión registrada"), { status: 409 });
  return { bytes, name: version.sourceName, mimeType: version.sourceMimeType, sourceSha256: version.sourceSha256 };
}
