import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertCausaAccess, assertCausaCapability, documentReadWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { isStaff } from "@/lib/auth/rbac";
import { writeAuditStrict } from "@/lib/audit";
import { inferDocumentoTipo } from "@/lib/document-ingest";
import { enqueueDocumentProcessing } from "@/lib/document-processing-queue";
import { MAX_STORAGE_OBJECT_BYTES, putObject } from "@/lib/storage";
import { isRealDriveFolderId } from "./drive-folder";
import { requireDriveSession } from "./google";

const API = "https://www.googleapis.com/drive/v3/files";
const META = "id,name,mimeType,version,modifiedTime,size,parents,trashed,md5Checksum,sha256Checksum,capabilities(canDownload)";
const ID = /^[A-Za-z0-9_-]{10,200}$/;
const VERSION = /^\d{1,30}$/;
const EXPORTS: Record<string, { mimeType: string; suffix: string }> = {
  "application/vnd.google-apps.document": { mimeType: "application/pdf", suffix: ".pdf" },
  "application/vnd.google-apps.presentation": { mimeType: "application/pdf", suffix: ".pdf" },
  "application/vnd.google-apps.spreadsheet": { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", suffix: ".xlsx" },
};
const BINARY = new Set(["application/pdf", "text/plain", "text/markdown", "text/csv", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/vnd.ms-excel", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/vnd.ms-powerpoint", "application/vnd.openxmlformats-officedocument.presentationml.presentation", "image/png", "image/jpeg", "image/tiff"]);

type RemoteFile = { id: string; name: string; mimeType: string; version?: string; modifiedTime?: string; size?: string; parents?: string[]; trashed?: boolean; md5Checksum?: string; sha256Checksum?: string; capabilities?: { canDownload?: boolean } };
export type DriveImportCandidate = { id: string; name: string; mimeType: string; version: string | null; modifiedTime: string | null; sizeBytes: number | null; exportMimeType: string | null; importable: boolean; reason: string | null };
type Dependencies = { client?: PrismaClient; fetch?: typeof fetch; session?: typeof requireDriveSession; enqueue?: typeof enqueueDocumentProcessing; timeoutMs?: number };
function fail(message: string, status: number, code: string) { return Object.assign(new Error(message), { status, code }); }
function validateId(id: string) { if (!ID.test(id)) throw fail("Identificador Drive inválido", 400, "invalid_drive_id"); }
function hash(bytes: Buffer, algorithm = "sha256") { return createHash(algorithm).update(bytes).digest("hex"); }

async function actor(user: CausaAccessUser, client: PrismaClient | Prisma.TransactionClient) {
  const current = await client.user.findUnique({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
  if (!current || !isStaff(current.role)) throw fail("Acceso de equipo requerido", 403, "staff_required");
  return current;
}
async function scope(causaId: string, user: CausaAccessUser, client: PrismaClient | Prisma.TransactionClient, write = false) {
  const current = await actor(user, client);
  if (write) await assertCausaCapability(causaId, current, "causa.write", client);
  else await assertCausaAccess(causaId, current, { auditOverride: false }, client);
  const causa = await client.causa.findUniqueOrThrow({ where: { id: causaId }, select: { googleDriveFolderId: true } });
  const folderId = causa.googleDriveFolderId;
  if (!folderId || !isRealDriveFolderId(folderId)) throw fail("Vincule una carpeta real de Drive antes de importar", 409, "drive_folder_required");
  validateId(folderId);
  return { actor: current, folderId };
}

async function readBounded(response: Response, max: number) {
  if (Number(response.headers.get("content-length") || 0) > max) { await response.body?.cancel(); throw fail("El archivo de Drive supera el límite de importación", 413, "drive_size_limit"); }
  const reader = response.body?.getReader();
  if (!reader) throw fail("Drive devolvió una respuesta vacía", 502, "drive_empty_response");
  const chunks: Uint8Array[] = []; let total = 0;
  try {
    for (;;) { const part = await reader.read(); if (part.done) break; total += part.value.length; if (total > max) { await reader.cancel(); throw fail("El archivo de Drive supera el límite de importación", 413, "drive_size_limit"); } chunks.push(part.value); }
    return Buffer.concat(chunks, total);
  } finally { reader.releaseLock(); }
}
function transport(config: Awaited<ReturnType<typeof requireDriveSession>>, options: Dependencies) {
  if (!config.accessToken) throw fail("Conecte Google Drive en Integraciones", 401, "needs_oauth");
  const timeout = options.timeoutMs ?? 30_000;
  if (!Number.isInteger(timeout) || timeout < 1 || timeout > 120_000) throw new RangeError("Tiempo de Drive inválido");
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  return {
    async get(path: string, max: number) {
      try {
        const response = await (options.fetch || fetch)(`${API}${path}`, { headers: { Authorization: `Bearer ${config.accessToken}` }, redirect: "error", signal: controller.signal, cache: "no-store" });
        if (!response.ok) { await response.body?.cancel(); throw fail(response.status === 401 ? "La conexión Drive venció; vuelva a conectar Google" : response.status === 403 ? "Google no permite leer o descargar este archivo con la cuenta conectada" : response.status === 404 ? "Archivo o carpeta de Drive no disponible" : "Drive no pudo completar la lectura; vuelva a intentar", response.status === 401 ? 401 : response.status === 403 ? 403 : response.status === 404 ? 404 : 502, "drive_api_error"); }
        return await readBounded(response, max);
      } catch (error) {
        if (controller.signal.aborted) throw fail("La lectura de Drive agotó su tiempo; vuelva a intentar", 504, "drive_timeout");
        if (error && typeof error === "object" && "status" in error) throw error;
        throw fail("No se pudo comunicar con Drive; vuelva a intentar", 502, "drive_network_error");
      }
    },
    close() { clearTimeout(timer); },
  };
}
function parseJson<T>(bytes: Buffer): T {
  try { return JSON.parse(bytes.toString("utf8")) as T; }
  catch { throw fail("Drive devolvió metadatos inválidos", 502, "drive_invalid_metadata"); }
}
function metadata(file: RemoteFile) {
  if (!file || typeof file.id !== "string" || !ID.test(file.id) || typeof file.name !== "string" || !file.name.trim() || file.name.length > 1000 || typeof file.mimeType !== "string" || file.mimeType.length > 200) throw fail("Drive devolvió metadatos inválidos", 502, "drive_invalid_metadata");
  const size = typeof file.size === "string" && /^\d+$/.test(file.size) && Number.isSafeInteger(Number(file.size)) ? Number(file.size) : null;
  const exported = EXPORTS[file.mimeType];
  const reason = file.trashed !== false ? "Archivo eliminado o estado no confirmado" : !file.version || !VERSION.test(file.version) ? "Drive no informó una revisión verificable" : file.capabilities?.canDownload !== true ? "Descarga no permitida" : !exported && !BINARY.has(file.mimeType) ? "Tipo no admitido para importación" : size !== null && !exported && size > MAX_STORAGE_OBJECT_BYTES ? "Archivo de más de 25 MiB" : null;
  return { id: file.id, name: file.name, mimeType: file.mimeType, version: file.version && VERSION.test(file.version) ? file.version : null, modifiedTime: typeof file.modifiedTime === "string" ? file.modifiedTime : null, sizeBytes: size, exportMimeType: exported?.mimeType || null, importable: reason === null, reason } satisfies DriveImportCandidate;
}
async function readFolder(io: ReturnType<typeof transport>, folderId: string) {
  const folder = parseJson<RemoteFile>(await io.get(`/${folderId}?${new URLSearchParams({ fields: "id,mimeType,trashed", supportsAllDrives: "true" })}`, 32 * 1024));
  if (folder.id !== folderId || folder.mimeType !== "application/vnd.google-apps.folder" || folder.trashed !== false) throw fail("La carpeta Drive vinculada ya no está disponible", 409, "drive_folder_changed");
}
async function readFile(io: ReturnType<typeof transport>, fileId: string, folderId: string) {
  const file = parseJson<RemoteFile>(await io.get(`/${fileId}?${new URLSearchParams({ fields: META, supportsAllDrives: "true" })}`, 32 * 1024));
  if (file.id !== fileId || !Array.isArray(file.parents) || !file.parents.includes(folderId)) throw fail("El archivo ya no pertenece a la carpeta elegida", 409, "drive_parent_changed");
  const preview = metadata(file);
  if (!preview.importable) throw fail(preview.reason!, 409, "drive_file_unavailable");
  return file;
}

/** Lists only the selected case's linked folder; never searches the whole account. */
export async function listDriveImportCandidates(causaId: string, user: CausaAccessUser, pageToken?: string | null, options: Dependencies = {}) {
  if (pageToken && (pageToken.length > 2048 || /[\x00-\x1f]/.test(pageToken))) throw fail("Página Drive inválida", 400, "invalid_drive_cursor");
  const client = options.client || prisma;
  const before = await scope(causaId, user, client);
  const config = await (options.session || requireDriveSession)();
  const io = transport(config, options);
  try {
    await readFolder(io, before.folderId);
    const params = new URLSearchParams({ q: `'${before.folderId}' in parents and trashed=false`, pageSize: "50", fields: `nextPageToken,incompleteSearch,files(${META})`, orderBy: "name", spaces: "drive", supportsAllDrives: "true", includeItemsFromAllDrives: "true", ...(pageToken ? { pageToken } : {}) });
    const data = parseJson<{ files?: RemoteFile[]; nextPageToken?: string; incompleteSearch?: boolean }>(await io.get(`?${params}`, 256 * 1024));
    if (!Array.isArray(data.files) || data.files.length > 50 || (data.nextPageToken && (typeof data.nextPageToken !== "string" || data.nextPageToken.length > 2048))) throw fail("Drive devolvió una lista inválida", 502, "drive_invalid_metadata");
    const files = data.files.filter(file => Array.isArray(file.parents) && file.parents.includes(before.folderId)).map(metadata);
    const after = await scope(causaId, user, client);
    if (after.folderId !== before.folderId) throw fail("La carpeta de la causa cambió; vuelva a abrir sus archivos", 409, "drive_folder_changed");
    return { folderId: before.folderId, files, nextPageToken: data.nextPageToken || null, incompleteSearch: data.incompleteSearch === true, scope: "Archivos visibles en la carpeta vinculada con la cuenta OAuth de LexOpen" };
  } finally { io.close(); }
}

/** Explicit single-file import; a new Drive version creates a separate local original. */
export async function importSelectedDriveFile(input: { causaId: string; folderId: string; fileId: string; version: string }, user: CausaAccessUser, options: Dependencies = {}) {
  validateId(input.folderId); validateId(input.fileId);
  if (!VERSION.test(input.version)) throw fail("Seleccione una revisión válida desde la lista Drive", 400, "invalid_drive_version");
  const client = options.client || prisma;
  const before = await scope(input.causaId, user, client, true);
  if (before.folderId !== input.folderId) throw fail("La carpeta vinculada cambió; vuelva a listar sus archivos", 409, "drive_folder_changed");
  const config = await (options.session || requireDriveSession)();
  const io = transport(config, options);
  try {
    await readFolder(io, before.folderId);
    const file = await readFile(io, input.fileId, before.folderId);
    if (file.version !== input.version) throw fail("El archivo cambió en Drive. Revise y seleccione la nueva revisión", 409, "drive_version_changed");
    const exported = EXPORTS[file.mimeType];
    const exportMimeType = exported?.mimeType || "";
    const identity = { causaId: input.causaId, driveFileId: input.fileId, driveVersion: input.version, exportMimeType };
    const unique = { causaId_driveFileId_driveVersion_exportMimeType: identity };
    const prior = await client.driveDocumentImport.findUnique({ where: unique, select: { documentoId: true, sourceSha256: true } });
    if (prior) {
      const current = await scope(input.causaId, user, client, true);
      if (current.folderId !== input.folderId || !await client.documento.count({ where: { id: prior.documentoId, ...documentReadWhere(current.actor) } })) throw fail("Documento no encontrado o sin acceso", 404, "import_not_found");
      return { documentoId: prior.documentoId, sourceSha256: prior.sourceSha256, reused: true, href: `/documentos/${prior.documentoId}/fuentes` };
    }
    const path = exported ? `/${file.id}/export?${new URLSearchParams({ mimeType: exported.mimeType })}` : `/${file.id}?${new URLSearchParams({ alt: "media", supportsAllDrives: "true" })}`;
    const bytes = await io.get(path, exported ? 10 * 1024 * 1024 : MAX_STORAGE_OBJECT_BYTES);
    if (!bytes.length) throw fail("El archivo está vacío", 422, "drive_empty_file");
    const afterFile = await readFile(io, input.fileId, before.folderId);
    if (afterFile.version !== file.version || afterFile.mimeType !== file.mimeType || afterFile.name !== file.name || afterFile.modifiedTime !== file.modifiedTime || afterFile.size !== file.size || afterFile.md5Checksum !== file.md5Checksum || afterFile.sha256Checksum !== file.sha256Checksum) throw fail("El archivo cambió durante la descarga. Vuelva a revisar su revisión", 409, "drive_version_changed");
    if (!exported && ((file.size !== undefined && Number(file.size) !== bytes.length) || (file.md5Checksum && hash(bytes, "md5") !== file.md5Checksum.toLowerCase()) || (file.sha256Checksum && hash(bytes) !== file.sha256Checksum.toLowerCase()))) throw fail("La descarga no coincide con la revisión de Drive", 409, "drive_bytes_changed");
    if (exported?.mimeType === "application/pdf" && bytes.subarray(0, 5).toString("ascii") !== "%PDF-") throw fail("Drive no devolvió la exportación PDF esperada", 422, "drive_export_invalid");
    if (exported?.suffix === ".xlsx" && bytes.subarray(0, 2).toString("ascii") !== "PK") throw fail("Drive no devolvió la planilla esperada", 422, "drive_export_invalid");
    const sourceSha256 = hash(bytes), downloadedAt = new Date();
    const storageKey = `drive-import/${encodeURIComponent(input.causaId)}/${input.fileId}/${input.version}/${sourceSha256}`;
    await putObject({ key: storageKey, body: bytes, contentType: exported?.mimeType || file.mimeType });
    const name = exported && !file.name.toLowerCase().endsWith(exported.suffix) ? `${file.name.slice(0, 980)}${exported.suffix}` : file.name;
    const provenance = { provider: "google-drive", folderId: before.folderId, driveFileId: file.id, driveVersion: file.version, name: file.name, mimeType: file.mimeType, modifiedTime: file.modifiedTime || null, size: file.size || null, md5Checksum: file.md5Checksum || null, exportMimeType: exported?.mimeType || null, acquiredAs: exported ? "workspace-export" : "original-download", downloadedAt: downloadedAt.toISOString(), connectedEmail: config.connectedEmail || null, sourceSha256 };
    for (let attempt = 0; ; attempt++) {
      try {
        const result = await client.$transaction(async tx => {
          const current = await scope(input.causaId, user, tx, true);
          if (current.folderId !== before.folderId) throw fail("La carpeta de la causa cambió; vuelva a abrir sus archivos", 409, "drive_folder_changed");
          const existing = await tx.driveDocumentImport.findUnique({ where: unique, select: { documentoId: true, sourceSha256: true } });
          if (existing) {
            if (existing.sourceSha256 !== sourceSha256) throw fail("Drive devolvió distintos bytes para la misma revisión; no se reemplazó el original", 409, "drive_revision_conflict");
            if (!await tx.documento.count({ where: { id: existing.documentoId, ...documentReadWhere(current.actor) } })) throw fail("Documento no encontrado o sin acceso", 404, "import_not_found");
            return { ...existing, reused: true };
          }
          const doc = await tx.documento.create({ data: { nombre: name, tipo: inferDocumentoTipo(name), mimeType: exported?.mimeType || file.mimeType, storageKey, extractionStatus: "pending", causaId: input.causaId, autorId: current.actor.id } });
          await tx.driveDocumentImport.create({ data: { ...identity, folderId: before.folderId, documentoId: doc.id, sourceSha256, metadataJson: JSON.stringify(provenance), importedAt: downloadedAt } });
          await writeAuditStrict({ actorId: current.actor.id, action: "document.drive.import", entityType: "Documento", entityId: doc.id, after: { causaId: input.causaId, driveFileId: file.id, driveVersion: file.version, sourceSha256, acquiredAs: provenance.acquiredAs } }, tx);
          await tx.activity.create({ data: { tipo: "documento", mensaje: `Se importó una copia de Drive: ${name}`, causaId: input.causaId, userId: current.actor.id } });
          return { documentoId: doc.id, sourceSha256, reused: false };
        }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
        if (!result.reused) (options.enqueue || enqueueDocumentProcessing)({ id: result.documentoId, name, bytes });
        return { ...result, href: `/documentos/${result.documentoId}/fuentes` };
      } catch (error) {
        if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) continue;
        throw error;
      }
    }
  } finally { io.close(); }
}
