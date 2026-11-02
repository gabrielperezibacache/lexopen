import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { documentReadWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { getObject, putObject } from "@/lib/storage";
import { writeAuditStrict } from "@/lib/audit";
import { EVIDENCE_EXTRACTOR_VERSION, sha256, splitEvidenceText } from "./fragments";

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
}) {
  const chunks = splitEvidenceText(input.text);
  if (!chunks.length) throw Object.assign(new Error("Este documento aún no tiene texto para citar"), { status: 409 });
  const resource = await client.documentResource.upsert({ where: { documentoId: input.documentoId }, create: { documentoId: input.documentoId }, update: {} });
  const sourceSha256 = sha256(input.bytes);
  const textSha256 = sha256(input.text);
  return client.documentEvidenceVersion.upsert({
    where: { resourceId_sourceSha256_textSha256_extractorVersion: { resourceId: resource.id, sourceSha256, textSha256, extractorVersion: EVIDENCE_EXTRACTOR_VERSION } },
    create: { resourceId: resource.id, sourceSha256, textSha256, extractorVersion: EVIDENCE_EXTRACTOR_VERSION, sourceName: input.name, sourceMimeType: input.mimeType, sourceStorageKey: input.storageKey, extractedText: input.text, extractionStatus: input.status, metadataJson: JSON.stringify(input.metadata || {}), fragments: { create: chunks } },
    update: {},
    select: { id: true, sourceSha256: true, textSha256: true, sourceName: true, createdAt: true, _count: { select: { fragments: true } } },
  });
}

export async function captureDocumentEvidence(id: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const doc = await authorizedEvidenceDocument(id, user, client);
  if (["pending", "processing"].includes(doc.extractionStatus || "")) throw Object.assign(new Error("El documento sigue en procesamiento. Intente de nuevo al finalizar"), { status: 409 });
  const text = doc.extractedMarkdown?.trim() ? doc.extractedMarkdown : doc.contenido || "";
  if (!text.trim()) throw Object.assign(new Error("Espere a que finalice la extracción o reintente el procesamiento"), { status: 409 });
  const bytes = doc.storageKey ? await getObject(doc.storageKey) : Buffer.from(doc.contenido || "", "utf8");
  if (!bytes) throw Object.assign(new Error("No se encontró el archivo original"), { status: 409 });
  let storageKey = doc.storageKey;
  if (!storageKey) {
    storageKey = `evidence/${encodeURIComponent(doc.id)}/${sha256(bytes)}`;
    await putObject({ key: storageKey, body: bytes, contentType: doc.mimeType || "text/plain" });
  }
  for (let attempt = 0; ; attempt++) {
    try {
      return await client.$transaction(async tx => {
        const current = await authorizedEvidenceDocument(id, user, tx);
        if (current.updatedAt.getTime() !== doc.updatedAt.getTime()) throw Object.assign(new Error("El documento cambió. Vuelva a preparar sus fuentes"), { status: 409 });
        const snapshot = await storeEvidenceSnapshot(tx, { documentoId: id, name: doc.nombre, mimeType: doc.mimeType, bytes, text, storageKey, status: doc.extractionStatus || "text", metadata: { locator: "text-offset", partial: doc.extractionStatus === "needs_ocr" } });
        await writeAuditStrict({ actorId: user.id, action: "document.evidence.capture", entityType: "Documento", entityId: id, after: { versionId: snapshot.id, sourceSha256: snapshot.sourceSha256 } }, tx);
        return snapshot;
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    } catch (error) {
      if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) continue;
      throw error;
    }
  }
}

export async function readDocumentEvidence(id: string, user: CausaAccessUser, query: { versionId?: string; after?: number; q?: string } = {}, client: PrismaClient = prisma) {
  const doc = await client.documento.findFirst({ where: { AND: [{ id }, documentReadWhere(user)] }, select: { id: true, nombre: true, extractionStatus: true, causaId: true } });
  if (!doc) throw notFound();
  const versions = await client.documentEvidenceVersion.findMany({
    where: { resource: { documentoId: id } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: 101, select: { id: true, sourceName: true, sourceSha256: true, createdAt: true, extractionStatus: true, metadataJson: true, _count: { select: { fragments: true } } },
  });
  const versionHistoryLimited = versions.length > 100;
  if (versionHistoryLimited) versions.pop();
  let selected = query.versionId ? versions.find(v => v.id === query.versionId) : versions[0];
  if (query.versionId && !selected) {
    const older = await client.documentEvidenceVersion.findFirst({ where: { id: query.versionId, resource: { documentoId: id } }, select: { id: true, sourceName: true, sourceSha256: true, createdAt: true, extractionStatus: true, metadataJson: true, _count: { select: { fragments: true } } } });
    if (!older) throw notFound();
    selected = older; versions.push(older);
  }
  const fragments = selected ? await client.documentEvidenceFragment.findMany({
    where: { versionId: selected.id, ordinal: { gt: query.after || 0 }, ...(query.q ? { text: { contains: query.q, mode: "insensitive" } } : {}) },
    orderBy: { ordinal: "asc" }, take: 51,
    select: { id: true, ordinal: true, text: true, textSha256: true, startOffset: true, endOffset: true },
  }) : [];
  const visible = fragments.slice(0,50);
  return { document: { id, name: doc.nombre, status: doc.extractionStatus, causaId: doc.causaId }, versions: versions.map(({metadataJson,...v})=>({...v, partial: (()=>{try{return Boolean(JSON.parse(metadataJson).partial)}catch{return false}})()})), selectedVersionId: selected?.id || null,
    fragments: visible.map(f=>({...f, href: `/documentos/${id}/fuentes?version=${selected!.id}&after=${f.ordinal - 1}#fragment-${f.ordinal}` })),
    nextAfter: fragments.length > 50 ? visible.at(-1)!.ordinal : null, versionHistoryLimited };
}

export async function authorizedEvidenceFragment(fragmentId: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const row = await client.documentEvidenceFragment.findFirst({
    where: { id: fragmentId, version: { resource: { documento: documentReadWhere(user) } } },
    select: { id: true, ordinal: true, versionId: true, text: true, textSha256: true, version: { select: { sourceSha256: true, resource: { select: { documentoId: true } } } } },
  });
  if (!row) throw notFound();
  return row;
}

export async function authorizedEvidenceOriginal(versionId: string, user: CausaAccessUser) {
  const version = await prisma.documentEvidenceVersion.findFirst({
    where: { id: versionId, resource: { documento: documentReadWhere(user) } },
    select: { sourceName: true, sourceStorageKey: true, sourceSha256: true, sourceMimeType: true, resource: { select: { documentoId: true } } },
  });
  if (!version?.resource.documentoId || !version.sourceStorageKey) throw notFound();
  const bytes = await getObject(version.sourceStorageKey);
  if (!bytes || sha256(bytes) !== version.sourceSha256) throw Object.assign(new Error("El original no coincide con la versión registrada"), { status: 409 });
  return { bytes, name: version.sourceName, mimeType: version.sourceMimeType };
}
