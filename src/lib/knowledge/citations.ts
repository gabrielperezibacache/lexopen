import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { causaAccessWhere, siteAccessWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { evidenceFragmentHref, evidenceResourceReadWhere } from "@/lib/evidence/service";
import { sha256, verifyEvidencePageBinding, verifyEvidenceQuote } from "@/lib/evidence/fragments";
import { getObjectBounded } from "@/lib/storage";
import type { ResearchSourceKind } from "@/lib/research/search";
import { audioPublicationContext, type AudioTranscriptCitation } from "./audio-transcript";

export type CitationInput = { kind: "document" | "legal"; fragmentId: string; quote: string };
export type StoredCitation = CitationInput & { versionId: string; quoteSha256: string; textSha256: string; sourceSha256: string; sourceKey: string; pageNumber: number | null };
export type ResolvedCitation = StoredCitation & {
  title: string; href: string; sourceKind: ResearchSourceKind | "case_document" | "space_file";
  documentId: string | null; siteFileId: string | null; siteId: string | null; causaId: string | null; resourceId: string | null;
  isCurrent: boolean; partial: boolean; extractionMethod: string | null; acquisitionMethod: string; warnings: string[];
  audioTranscript?: AudioTranscriptCitation;
};
export type CitationClient = PrismaClient | Prisma.TransactionClient;
export type CitationOptions = { causaId?: string; siteId?: string; publicOnly?: boolean; client?: CitationClient; cache?: Map<string, unknown> };
const missing = () => httpError("Cita no encontrada o sin acceso actual", 404);
const invalid = () => httpError("La cita o su original no coincide con la versión registrada", 409);

async function actorFor(user: CausaAccessUser, client: CitationClient) {
  const actor = await client.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
  if (!actor || !isStaff(actor.role) || !canSome(actor, "assistant.use")) throw httpError("No tiene permiso para usar conocimiento con fuentes", 403);
  return actor;
}
async function scopeFor(options: CitationOptions, user: CausaAccessUser, client: CitationClient) {
  if (options.causaId && !await client.causa.findFirst({ where: { AND: [{ id: options.causaId }, causaAccessWhere(user)] }, select: { id: true } })) throw missing();
  if (options.siteId && !await client.site.findFirst({ where: { AND: [{ id: options.siteId }, siteAccessWhere(user), ...(options.causaId ? [{ causaId: options.causaId }] : [])] }, select: { id: true } })) throw missing();
}
async function original(key: string | null, expected: string, cache: Map<string, unknown>) {
  if (!key || !/^[a-f0-9]{64}$/.test(expected)) throw invalid();
  const cacheKey = `original:${key}:${expected}`, existing = cache.get(cacheKey);
  if (existing === true) return;
  if (existing instanceof Promise) { await existing; return; }
  const pending = (async () => {
    let bytes;
    try { bytes = await getObjectBounded(key); } catch (error) { if ((error as { status?: number }).status === 413) throw invalid(); throw error; }
    if (!bytes || sha256(bytes) !== expected) throw invalid();
  })();
  cache.set(cacheKey, pending);
  try { await pending; cache.set(cacheKey, true); } catch (error) { cache.delete(cacheKey); throw error; }
}
/** JS/UTF-16 offsets, including astral characters; bounded private cache per request. */
async function body(kind: CitationInput["kind"], versionId: string, expected: string, fragment: { text: string; startOffset: number; endOffset: number }, client: CitationClient, cache: Map<string, unknown>) {
  const start = fragment.startOffset, end = fragment.endOffset;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end > 2_000_000 || end - start !== fragment.text.length) throw invalid();
  const key = `body:${kind}:${versionId}:${expected}`;
  let value = cache.get(key);
  if (typeof value !== "string" && !(value instanceof Promise)) {
    const table = kind === "legal" ? Prisma.sql`"LegalSourceVersion"` : Prisma.sql`"DocumentEvidenceVersion"`;
    const column = kind === "legal" ? Prisma.sql`"text"` : Prisma.sql`"extractedText"`;
    const pending = (async () => {
      const rows = await client.$queryRaw<{ whole: string }[]>(Prisma.sql`SELECT CASE WHEN octet_length(${column}) <= 8_000_000 THEN ${column} ELSE NULL END AS whole FROM ${table} WHERE "id" = ${versionId}`);
      const text = rows[0]?.whole;
      if (typeof text !== "string" || text.length > 2_000_000 || sha256(text) !== expected) throw invalid();
      const used = Number(cache.get("body:cachedChars") || 0);
      if (used + text.length <= 8_000_000) { cache.set(key, text); cache.set("body:cachedChars", used + text.length); } else cache.delete(key);
      return text;
    })();
    cache.set(key, pending); value = pending;
  }
  let text: unknown;
  try { text = value instanceof Promise ? await value : value; } catch (error) { cache.delete(key); throw error; }
  if (typeof text !== "string" || text.slice(start, end) !== fragment.text) throw invalid();
}

function stored(input: CitationInput, versionId: string, textSha256: string, sourceSha256: string, pageNumber: number | null): StoredCitation {
  const quoteSha256 = sha256(input.quote);
  return { ...input, versionId, quoteSha256, textSha256, sourceSha256, pageNumber, sourceKey: sha256(JSON.stringify([input.kind, input.fragmentId, versionId, quoteSha256, textSha256, sourceSha256, pageNumber])) };
}
function isPartial(json: string, status: string) {
  try { return Boolean(JSON.parse(json).partial) || ["needs_ocr", "partial", "failed"].includes(status); } catch { return true; }
}

function legalWarnings(json: string, method: string) {
  let warnings: string[] = [];
  try { const values = JSON.parse(json).coverageWarnings; if (Array.isArray(values)) warnings = values.filter((v: unknown): v is string => typeof v === "string").slice(0, 20); } catch { warnings.push("Metadatos de procedencia incompletos"); }
  if (method === "manual") warnings.push("Aporte manual sin cotejo oficial");
  return [...new Set(warnings)];
}
export async function resolveCitation(input: CitationInput, user: CausaAccessUser, options: CitationOptions = {}): Promise<ResolvedCitation> {
  if (!input || !["document", "legal"].includes(input.kind) || typeof input.fragmentId !== "string" || !input.fragmentId || input.fragmentId.length > 100 || typeof input.quote !== "string" || !input.quote.trim() || input.quote.length > 10_000) throw httpError("Cita inválida", 400);
  const client = options.client || prisma, cache = options.cache || new Map<string, unknown>();
  const actor = await actorFor(user, client); await scopeFor(options, actor, client);
  if (input.kind === "legal") {
    const row = await client.legalSourceFragment.findUnique({ where: { id: input.fragmentId }, select: { id: true, ordinal: true, versionId: true, text: true, textSha256: true, startOffset: true, endOffset: true, version: { select: { title: true, kind: true, acquisitionMethod: true, metadataJson: true, textSha256: true, sourceSha256: true, sourceStorageKey: true, source: { select: { versions: { orderBy: [{ retrievedAt: "desc" }, { id: "desc" }], take: 1, select: { id: true } } } } } } } });
    if (!row) throw missing();
    if (!verifyEvidenceQuote(row, input.quote)) throw invalid();
    await body(input.kind, row.versionId, row.version.textSha256, row, client, cache);
    await original(row.version.sourceStorageKey, row.version.sourceSha256, cache);
    return { ...stored(input, row.versionId, row.textSha256, row.version.sourceSha256, null), title: row.version.title, href: `/jurisprudencia/fuentes/${row.versionId}?fragment=${row.ordinal}#fragment-${row.ordinal}`, sourceKind: row.version.kind as ResearchSourceKind, documentId: null, siteFileId: null, siteId: null, causaId: null, resourceId: null, isCurrent: row.version.source.versions[0]?.id === row.versionId, partial: false, extractionMethod: null, acquisitionMethod: row.version.acquisitionMethod, warnings: legalWarnings(row.version.metadataJson, row.version.acquisitionMethod) };
  }
  if (options.publicOnly) throw missing();
  const scope: Prisma.DocumentResourceWhereInput = options.siteId ? { siteFile: { siteId: options.siteId } } : options.causaId ? { OR: [{ documento: { causaId: options.causaId } }, { siteFile: { site: { causaId: options.causaId } } }] } : {};
  const row = await client.documentEvidenceFragment.findFirst({
    where: { id: input.fragmentId, version: { resource: { AND: [evidenceResourceReadWhere(actor), scope] } } },
    select: { id: true, ordinal: true, versionId: true, text: true, textSha256: true, startOffset: true, endOffset: true, pageId: true, pageStartOffset: true, pageEndOffset: true, page: { select: { versionId: true, pageNumber: true, text: true, textSha256: true, method: true } }, version: { select: { sourceName: true, sourceSha256: true, sourceStorageKey: true, textSha256: true, sourceRevision: true, createdAt: true, locatorKind: true, metadataJson: true, extractionStatus: true, resource: { select: { id: true, documentoId: true, siteFileId: true, documento: { select: { causaId: true, version: true, updatedAt: true, extractionJson: true, audioPublication: { select: { audioId: true } } } }, siteFile: { select: { siteId: true, version: true, updatedAt: true, site: { select: { causaId: true } } } }, versions: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 1, select: { id: true } } } } } } },
  });
  if (!row) throw missing();
  if (!verifyEvidenceQuote(row, input.quote) || row.version.locatorKind === "pdf-page" && !row.page || !verifyEvidencePageBinding(row)) throw invalid();
  await body(input.kind, row.versionId, row.version.textSha256, row, client, cache);
  await original(row.version.sourceStorageKey, row.version.sourceSha256, cache);
  const resource = row.version.resource, record = resource.documento || resource.siteFile;
  const transcript = audioPublicationContext(resource.documento);
  const isCurrent = resource.versions[0]?.id === row.versionId && Boolean(record) && (row.version.sourceRevision === "legacy" ? record!.updatedAt.getTime() <= row.version.createdAt.getTime() : row.version.sourceRevision === `${record!.version}:${record!.updatedAt.toISOString()}`);
  return { ...stored(input, row.versionId, row.textSha256, row.version.sourceSha256, row.page?.pageNumber || null), title: row.version.sourceName, href: evidenceFragmentHref(row), sourceKind: resource.siteFileId ? "space_file" : "case_document", documentId: resource.documentoId, siteFileId: resource.siteFileId, siteId: resource.siteFile?.siteId || null, causaId: resource.documento?.causaId || resource.siteFile?.site.causaId || null, resourceId: resource.id, isCurrent, partial: isPartial(row.version.metadataJson, row.version.extractionStatus), extractionMethod: row.page?.method || null, acquisitionMethod: resource.siteFileId ? "space_file" : "case_document", ...(transcript.audioTranscript ? { audioTranscript: transcript.audioTranscript } : {}), warnings: [...transcript.warnings, ...(row.page?.method === "ocr" ? ["Texto OCR: contraste la cita con la imagen del original"] : [])] };
}

export function toStoredCitation(value: ResolvedCitation): StoredCitation {
  const { kind, fragmentId, versionId, quote, quoteSha256, textSha256, sourceSha256, sourceKey, pageNumber } = value;
  return { kind, fragmentId, versionId, quote, quoteSha256, textSha256, sourceSha256, sourceKey, pageNumber };
}
export async function verifyStoredCitation(value: StoredCitation, user: CausaAccessUser, options: CitationOptions = {}): Promise<ResolvedCitation> {
  if (!value || typeof value !== "object") throw invalid();
  const result = await resolveCitation(value, user, options);
  const expected = toStoredCitation(result);
  if ((Object.keys(expected) as (keyof StoredCitation)[]).some(key => value[key] !== expected[key])) throw invalid();
  return result;
}
