import type { Folder, Prisma } from "@prisma/client";
import { httpError, requireSiteMutationAccess } from "@/lib/auth/access";
import { assertCausaAccess, assertCausaCapability, documentReadWhere, siteFileReadWhere, siteAccessWhere, causaAccessWhere } from "@/lib/auth/causa-access";
import { can } from "@/lib/auth/permissions";
import { currentStaffActor, type ResolvedStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { canonicalJson, serializable } from "@/lib/command-execution";
import { getObjectBounded } from "@/lib/storage";
import { sanitizeUploadMimeType } from "@/lib/security/download";
import { hashReference, causeReference } from "./references";
import { fileKind, MAX_OFFLINE_FILE_BYTES, type FileKind, type FileContent, type FileFields } from "./file-schemas";
import { createHash } from "node:crypto";
export type FileTx = Prisma.TransactionClient;
export const digest = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
export function decodeContent(content: FileContent) {
  let bytes: Buffer;
  if (content.mode === "text") { if (content.text.includes("\0")) throw httpError("Conserve el contenido con bytes nulos como adjunto binario", 422); bytes = Buffer.from(content.text, "utf8"); }
  else { bytes = Buffer.from(content.base64, "base64"); if (bytes.toString("base64") !== content.base64 || bytes.length !== content.size) throw httpError("El adjunto está incompleto o no tiene una codificación válida", 422); }
  if (bytes.length > MAX_OFFLINE_FILE_BYTES || digest(bytes) !== content.sha256) throw httpError("El archivo no coincide con su huella o supera 8 MiB", 422);
  return bytes;
}
export function encodeContent(bytes: Buffer, rawMime: string | null): FileContent {
  const mimeType = sanitizeUploadMimeType(rawMime), sha256 = digest(bytes);
  if (["text/plain", "text/markdown", "text/csv", "application/json"].includes(mimeType) && bytes.length <= 1024 * 1024) {
    try { const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes); if (!text.includes("\0") && Buffer.from(text).equals(bytes)) return { mode: "text", text, mimeType, sha256 }; } catch {}
  }
  return { mode: "binary", base64: bytes.toString("base64"), mimeType, size: bytes.length, sha256 };
}
export async function targetSnapshot(type: "cause" | "site", id: string, folderId: string | null, actor: ResolvedStaffActor, tx: FileTx) {
  if (type === "cause") { if (folderId) throw httpError("La carpeta no pertenece a una causa preparada", 400); const ref = await causeReference(id, actor, tx, true); return { type, id, folderId, label: ref.label, version: ref.version }; }
  await requireSiteMutationAccess(id, actor, tx);
  const site = await tx.site.findUniqueOrThrow({ where: { id }, include: { members: { orderBy: { id: "asc" } } } });
  const cause = site.causaId ? await causeReference(site.causaId, actor, tx, true) : null;
  const chain: Folder[] = []; let parent = folderId;
  while (parent) { if (chain.length >= 30 || chain.some(f => f.id === parent)) throw httpError("Revise la estructura de carpetas con conexión", 409); const f = await tx.folder.findFirst({ where: { id: parent, siteId: id } }); if (!f) throw httpError("La carpeta ya no está disponible", 404); chain.push(f); parent = f.parentId; }
  return { type, id, folderId, label: site.name + (chain.length ? " / " + chain.map(f => f.name).reverse().join(" / ") : " / Raíz"), version: hashReference({ site, cause, chain }) };
}
export async function listFileTargets(user: StaffActor, kind: FileKind, q: string, siteId?: string) {
  return serializable(async tx => {
    const actor = await currentStaffActor(user, tx), result = [];
    if (kind === "documento") {
      const rows = await tx.causa.findMany({ where: { AND: [causaAccessWhere(actor), { titulo: { contains: q, mode: "insensitive" } }] }, orderBy: { id: "asc" }, take: 50, select: { id: true } });
      for (const r of rows) { try { result.push(await targetSnapshot("cause", r.id, null, actor, tx)); } catch (e) { if (![403,404].includes((e as { status?: number }).status || 0)) throw e; } }
    } else {
      const rows = await tx.site.findMany({ where: { AND: [siteAccessWhere(actor), { ...(siteId ? { id: siteId } : { name: { contains: q, mode: "insensitive" } }) }] }, orderBy: { id: "asc" }, take: siteId ? 1 : 20, select: { id: true } });
      for (const r of rows) { try { result.push(await targetSnapshot("site", r.id, null, actor, tx)); if (siteId) for (const f of await tx.folder.findMany({ where: { siteId }, orderBy: { id: "asc" }, take: 50 })) result.push(await targetSnapshot("site", r.id, f.id, actor, tx)); } catch (e) { if (![403,404].includes((e as { status?: number }).status || 0)) throw e; } }
    }
    return result;
  });
}
export async function loadFileSource(kind: FileKind, id: string, actor: ResolvedStaffActor, tx: FileTx) {
  if (kind === "documento") {
    const row = await tx.documento.findFirst({ where: { id, ...documentReadWhere(actor) }, include: { minutas: { orderBy: { id: "asc" }, select: { id: true, updatedAt: true, confidencial: true } }, driveImport: { select: { id: true } }, caseAudioSource: { select: { id: true } }, audioPublication: { select: { id: true } }, pjudDocumentJobs: { select: { id: true }, orderBy: { id: "asc" } } } });
    if (!row) throw httpError("Documento no disponible", 404);
    const cause = row.causaId ? await tx.causa.findUniqueOrThrow({ where: { id: row.causaId }, include: { miembros: { orderBy: { id: "asc" } } } }) : null;
    return { kind, row, context: cause, contentLocked: Boolean(row.minutas.length || row.driveImport || row.caseAudioSource || row.audioPublication || row.pjudDocumentJobs.length || row.googleDriveId || row.obsidianPath) } as const;
  }
  const row = await tx.siteFile.findFirst({ where: { id, ...siteFileReadWhere(actor) } }); if (!row) throw httpError("Adjunto no disponible", 404);
  const target = await targetReadContext(row.siteId, row.folderId, actor, tx);
  return { kind, row, context: target, contentLocked: Boolean(row.checkedOut || row.storagePath && !row.storageKey) } as const;
}
async function targetReadContext(id: string, folderId: string | null, actor: ResolvedStaffActor, tx: FileTx) {
  const site = await tx.site.findFirst({ where: { id, ...siteAccessWhere(actor) }, include: { members: { orderBy: { id: "asc" } } } }); if (!site) throw httpError("Espacio no disponible", 404);
  const cause = site.causaId ? await tx.causa.findUniqueOrThrow({ where: { id: site.causaId }, include: { miembros: { orderBy: { id: "asc" } } } }) : null;
  const folder = folderId ? await tx.folder.findFirst({ where: { id: folderId, siteId: id } }) : null;
  return { site, cause, folder };
}
export type FileSource = Awaited<ReturnType<typeof loadFileSource>>;
export async function authorizeFileWrite(source: FileSource, actor: ResolvedStaffActor, tx: FileTx) {
  if (source.kind === "documento") {
    if (source.row.causaId) await assertCausaCapability(source.row.causaId, actor, "causa.write", tx);
    else if (!can(actor, "causa.write", { own: source.row.autorId === actor.id })) throw httpError("El documento sin causa requiere permiso de edición sobre la copia propia o permiso general", 403);
  } else { await requireSiteMutationAccess(source.row.siteId, actor, tx); if (source.row.checkedOut) throw httpError("El adjunto está reservado. Libérelo con conexión antes de modificarlo", 409); }
}
export async function sourceBytes(source: FileSource) {
  // A missing retained original must never fall back to extracted text.
  if (source.kind === "adjunto" && source.row.storagePath && !source.row.storageKey) throw httpError("Prepare el original desde el Host antes de trabajar sin conexión", 409);
  const bytes = source.row.storageKey ? await getObjectBounded(source.row.storageKey, MAX_OFFLINE_FILE_BYTES).catch((e: unknown) => { if ((e as { status?: number }).status === 413) throw httpError("El original supera el límite local. Conserve la copia y revíselo con conexión", 409); throw e; }) : Buffer.from(source.row.contenido || "", "utf8");
  if (!bytes) throw httpError("El original no está disponible; la copia local se conserva", 409);
  if (bytes.length > MAX_OFFLINE_FILE_BYTES) throw httpError("El original supera 8 MiB. Descárguelo con conexión", 409);
  return bytes;
}
export async function sourceSnapshot(source: FileSource, actor: ResolvedStaffActor, tx: FileTx) {
  const bytes = await sourceBytes(source), content = encodeContent(bytes, source.row.mimeType);
  let canEdit = true; try { await authorizeFileWrite(source, actor, tx); } catch (e) { if (![403,404,409].includes((e as { status?: number }).status || 0)) throw e; canEdit = false; }
  const r = source.row;
  const fields: FileFields = source.kind === "documento" ? { name: source.row.nombre, type: source.row.tipo, path: source.row.ruta, tags: "", confidential: r.confidencial, privileged: r.privilegio } : { name: source.row.name, type: "otro", path: null, tags: source.row.tags, confidential: r.confidencial, privileged: r.privilegio };
  const target = canEdit ? source.kind === "documento" ? source.row.causaId ? await targetSnapshot("cause", source.row.causaId, null, actor, tx) : null : await targetSnapshot("site", source.row.siteId, source.row.folderId, actor, tx) : null;
  const stableRow: Record<string, unknown> = { ...source.row };
  // OCR leases and derived text do not revise an original. Its bytes, business
  // metadata, revision counter, sources and matter context still participate.
  if (source.kind === "documento") for (const key of ["updatedAt", "extractedMarkdown", "extractionStatus", "extractionJson", "extractionAttempts", "extractionLockedAt", "extractionLockToken", "extractionNextAttemptAt"]) delete stableRow[key];
  return { kind: source.kind, id: r.id, version: hashReference({ source: { ...source, row: stableRow }, sha256: content.sha256 }), number: r.version, fields, content, canEdit, contentEditable: canEdit && !source.contentLocked, target, needsProcessing: source.kind === "documento" && source.row.extractionStatus === "pending", targetLabel: source.kind === "documento" ? source.context?.titulo || "Sin causa" : source.context.site.name + (source.context.folder ? " / " + source.context.folder.name : " / Raíz") };
}
export async function readOfflineFile(user: StaffActor, kind: string, id: string) {
  const k = fileKind.parse(kind);
  return serializable(async tx => { const actor = await currentStaffActor(user, tx); return sourceSnapshot(await loadFileSource(k, id, actor, tx), actor, tx); });
}
export async function authorizeHistoricalFlags(actor: ResolvedStaffActor, row: { causaId?: string | null; _causeId?: string | null; autorId?: string | null; confidencial: boolean; privilegio: boolean }, tx: FileTx) {
  const causeId = row.causaId || row._causeId, access = causeId ? await assertCausaAccess(causeId, actor, { auditOverride: false }, tx) : null;
  if (row.confidencial && !can(actor, "doc.confidential.read") || row.privilegio && (!can(actor, "doc.confidential.read") || !can(actor, "doc.privileged.read", { own: row.autorId === actor.id || Boolean(access?.causaRol) }))) throw httpError("La revisión no está disponible con sus permisos actuales", 403);
}
export const fileSignature = (fields: FileFields, sha256: string) => hashReference({ fields: JSON.parse(canonicalJson(fields)), sha256 });
