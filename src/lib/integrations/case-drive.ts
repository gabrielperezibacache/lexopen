import { resolveStudyDriveAccount, studyDriveMode } from "./google-study-drive";
/** Case folders and deliberate outgoing copies, using the professional's existing Altazor account. */
import { createHash, randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCausaAccess, assertCausaCapability, documentReadWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { httpError } from "@/lib/auth/access";
import { writeAuditStrict } from "@/lib/audit";
import { canonicalJson } from "@/lib/command-execution";
import { digest } from "@/lib/personal-connectors/core";
import { getObjectBounded } from "@/lib/storage";
import { DRIVE_WRITE_MAX_BYTES, resolveAltazorDriveAccount, type DriveManagementOptions, type DriveWriteCommand, type DriveWriteReceipt, type ManagedDriveAccount } from "@/lib/altazor/connectors/drive-management";
import { inspectChosenDriveFolder } from "./drive-import";
import { driveFolderUrl, isRealDriveFolderId, parseGoogleDriveFolderRef } from "./drive-folder";

type Db = typeof prisma | Prisma.TransactionClient;
type Options = DriveManagementOptions & { account?: ManagedDriveAccount; authorizeContext?: () => Promise<void>; signal?: AbortSignal };
const hex = z.string().regex(/^[a-f0-9]{64}$/), identifier = z.string().min(1).max(160);
const name = z.string().trim().min(1).max(180).refine(value => !value.startsWith(".") && Buffer.byteLength(value, "utf8") <= 180 && !/[\/\\\p{Cc}\p{Cf}]/u.test(value), "Usa un nombre de hasta 180 bytes, sin punto inicial, barras ni caracteres de control");
const common = { requestId: z.string().regex(/^[A-Za-z0-9._:-]{8,100}$/), connectionId: identifier, bindingRevision: hex, confirmed: z.literal(true) };
const writeCommon = { ...common, caseRevision: hex };
const documentFields = { documentoId: identifier, documentVersion: z.number().int().positive(), sourceSha256: hex, nombre: name.optional() };
export const caseDriveCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...writeCommon, action: z.literal("create-folder"), nombre: name, parentFolderId: z.string().regex(/^(?:root|[A-Za-z0-9_-]{10,200})$/).optional() }).strict(),
  z.object({ ...writeCommon, ...documentFields, action: z.literal("upload-document") }).strict(),
  z.object({ ...writeCommon, ...documentFields, action: z.literal("save-version"), fileId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/), expectedVersion: z.string().regex(/^\d{1,30}$/) }).strict(),
  z.object({ ...common, action: z.literal("reconcile") }).strict(),
]);
export type CaseDriveCommand = z.infer<typeof caseDriveCommandSchema>;
export type CaseDriveBinding = { source?: "study" | "altazor"; ownerId: string; accountId: string; accountRevision: string; proofRevision: string; folderId: string; generation: string };
type Snapshot = { documentoId: string; version: number; storageKey: string; sha256: string; bytes: number; mime: string; name: string; remoteId: string | null };
type Saved = { version: 1; binding: CaseDriveBinding | null; command: DriveWriteCommand; bytes: number; caseFolderId: string | null; subscriptionGeneration: number | null; source?: Snapshot; result?: CaseDriveResult };
export type CaseDriveResult = { state: "completed" | "unknown" | "pending" | "failed"; operationId: string; message: string; folder?: { id: string; name: string; url: string }; file?: { id: string; name: string; mime: string; bytes: number; sha256?: string; previousFileId?: string; previousVersion?: string } };
const bindingKey = (causaId: string) => `drive-case-binding:${causaId}`;
const operationPrefix = (ownerId: string, causaId: string) => `drive-case:${digest(`${ownerId}:${causaId}`)}:`;
const sourceHash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
async function assertCommandAuthorization(options: Options) {
  options.signal?.throwIfAborted();
  await options.authorizeContext?.();
  options.signal?.throwIfAborted();
}
async function actor(causaId: string, user: CausaAccessUser, db: Db, write = true) {
  const current = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
  if (write) await assertCausaCapability(causaId, current, "causa.write", db); else await assertCausaAccess(causaId, current, { auditOverride: false }, db);
  return current;
}
export async function readAltazorDriveFolderBinding(causaId: string, db: Db = prisma): Promise<CaseDriveBinding | null> {
  const row = await db.commandExecution.findUnique({ where: { key: bindingKey(causaId) } });
  if (!row || row.status !== "completed" || !row.resultJson) return null;
  try {
    const value = JSON.parse(row.resultJson) as CaseDriveBinding;
    if (value.ownerId !== row.ownerId || !value.accountId || !/^[a-f0-9]{64}$/.test(value.accountRevision) || !/^[a-f0-9]{64}$/.test(value.proofRevision) || !isRealDriveFolderId(value.folderId) || !value.generation) return null;
    return value;
  } catch { return null; }
}
export async function caseDriveRevision(causaId: string, db: Db = prisma) {
  const [cause, subscription, binding] = await Promise.all([db.causa.findUniqueOrThrow({ where: { id: causaId }, select: { googleDriveFolderId: true } }), db.driveSyncSubscription.findUnique({ where: { causaId }, select: { generation: true } }), readAltazorDriveFolderBinding(causaId, db)]);
  return digest(canonicalJson({ causaId, folderId: cause.googleDriveFolderId, subscriptionGeneration: subscription?.generation ?? null, bindingGeneration: binding?.generation ?? null }));
}
export async function assertAltazorDriveFolderBinding(causaId: string, user: CausaAccessUser, expected: CaseDriveBinding, account: ManagedDriveAccount, db: Db = prisma) {
  await actor(causaId, user, db); await account.assertActive(db);
  const [binding, cause, subscription] = await Promise.all([
    readAltazorDriveFolderBinding(causaId, db),
    db.causa.findUniqueOrThrow({ where: { id: causaId }, select: { googleDriveFolderId: true } }),
    db.driveSyncSubscription.findUnique({ where: { causaId } }),
  ]);
  if (!binding || canonicalJson(binding) !== canonicalJson(expected) || (binding.source !== "study" && binding.ownerId !== user.id) || binding.accountId !== account.connectionId || binding.accountRevision !== account.bindingRevision || binding.proofRevision !== account.proofRevision || cause.googleDriveFolderId !== binding.folderId || !subscription || (binding.source !== "study" && subscription.ownerId !== user.id) || subscription.account !== (binding.source || "altazor") || subscription.connectionId !== account.connectionId || subscription.folderId !== binding.folderId) throw httpError("La carpeta o la cuenta cambió. Vuelve a abrir Drive.", 409);
}
async function availableAccount(user: CausaAccessUser, options: Options): Promise<ManagedDriveAccount> {
  const account = options.account || (await studyDriveMode(options.client) ? await resolveStudyDriveAccount(user, options.client) : await resolveAltazorDriveAccount(user, options));
  if (!account || account.ownerId !== user.id) throw httpError("Conecta Google Drive desde las aplicaciones de Altazor.", 409);
  return account;
}
async function assertNoOtherActiveOwner(causaId: string, ownerId: string, db: Db) {
  const prior = await db.driveSyncSubscription.findUnique({ where: { causaId } });
  if (prior?.enabled && prior.ownerId !== ownerId) throw httpError("La sincronización fue activada por otro profesional. Debe pausarla antes de transferir la carpeta.", 403);
}
async function storeFolder(causaId: string, user: CausaAccessUser, account: ManagedDriveAccount, folder: { id: string; name: string }, db: Db) {
  await actor(causaId, user, db); await account.assertActive(db); await assertNoOtherActiveOwner(causaId, user.id, db);
  const binding: CaseDriveBinding = { source: account.source || "altazor", ownerId: user.id, accountId: account.connectionId, accountRevision: account.bindingRevision, proofRevision: account.proofRevision, folderId: folder.id, generation: randomUUID() };
  await db.causa.update({ where: { id: causaId }, data: { googleDriveFolderId: folder.id, googleDriveFolderName: folder.name, googleDriveFolderUrl: driveFolderUrl(folder.id) } });
  const data = { ownerId: user.id, account: account.source || "altazor", connectionId: account.connectionId, folderId: folder.id, enabled: false, status: "paused", nextRunAt: null, scanCursor: null, leaseToken: null, leaseExpiresAt: null, note: "Carpeta vinculada con tu cuenta de Altazor. Activa su actualización cuando quieras." };
  await db.driveSyncSubscription.upsert({ where: { causaId }, create: { causaId, ...data }, update: { ...data, generation: { increment: 1 } } });
  await db.commandExecution.upsert({ where: { key: bindingKey(causaId) }, create: { key: bindingKey(causaId), ownerId: user.id, inputHash: digest(canonicalJson(binding)), status: "completed", resultJson: canonicalJson(binding) }, update: { ownerId: user.id, inputHash: digest(canonicalJson(binding)), status: "completed", resultJson: canonicalJson(binding) } });
  await writeAuditStrict({ actorId: user.id, action: "case.drive.folder-link", entityType: "Causa", entityId: causaId, after: { folderId: folder.id, accountId: account.connectionId } }, db);
}
export async function linkAltazorDriveFolder(causaId: string, user: CausaAccessUser, input: { folderRef: string; connectionId: string; bindingRevision: string; caseRevision: string }, options: Options = {}) {
  const db = options.client || prisma; await actor(causaId, user, db);
  const account = await availableAccount(user, options);
  if (account.connectionId !== input.connectionId || account.bindingRevision !== input.bindingRevision) throw httpError("La cuenta cambió. Abre de nuevo el selector de carpetas.", 409);
  if (input.caseRevision !== await caseDriveRevision(causaId, db)) throw httpError("La carpeta de la causa cambió. Abre de nuevo el selector.", 409);
  const chosen = parseGoogleDriveFolderRef(input.folderRef); if (!chosen || !isRealDriveFolderId(chosen.folderId)) throw httpError("Selecciona una carpeta real de Drive.", 400);
  const folder = await inspectChosenDriveFolder(chosen.folderId, null, { openTransport: account.openTransport });
  await db.$transaction(async tx => { await tx.$queryRaw`SELECT id FROM "Causa" WHERE id = ${causaId} FOR UPDATE`; if (input.caseRevision !== await caseDriveRevision(causaId, tx)) throw httpError("La carpeta de la causa cambió. Abre de nuevo el selector.", 409); await storeFolder(causaId, user, account, folder, tx); });
  return { status: "linked", message: "Carpeta vinculada con tu cuenta de Google de Altazor.", folder, account: "altazor" as const };
}
async function documentSnapshot(causaId: string, documentoId: string, user: CausaAccessUser, db: Db): Promise<Snapshot> {
  const current = await actor(causaId, user, db);
  const doc = await db.documento.findFirst({ where: { AND: [{ id: documentoId, causaId }, documentReadWhere(current)] }, select: { id: true, version: true, storageKey: true, nombre: true, mimeType: true, googleDriveId: true, confidencial: true, privilegio: true } });
  if (!doc) throw httpError("Documento no encontrado.", 404);
  if (doc.confidencial || doc.privilegio) throw httpError("Este documento está marcado como reservado.", 403);
  if (!doc.storageKey) throw httpError("Guarda primero el archivo original en LexOpen.", 409);
  let bytes: Buffer | null;
  try { bytes = await getObjectBounded(doc.storageKey, DRIVE_WRITE_MAX_BYTES); } catch { throw httpError("Esta copia admite archivos de hasta 4 MiB.", 413); }
  if (!bytes?.length) throw httpError("El archivo original ya no está disponible.", 409);
  const fileName = doc.nombre.split(/[\\/]/).at(-1)?.replace(/[\p{Cc}\p{Cf}]/gu, "").slice(0, 180) || "documento";
  const parsedName = name.safeParse(fileName);
  if (!parsedName.success) throw httpError("Asigna un nombre de hasta 180 bytes y sin punto inicial al documento antes de copiarlo.", 400);
  const mime = doc.mimeType || "application/octet-stream";
  if (!/^[A-Za-z0-9!#$&^_.+-]+\/[A-Za-z0-9!#$&^_.+-]+$/.test(mime) || mime.length > 200 || mime.startsWith("application/vnd.google-apps.")) throw httpError("Guarda una versión de archivo antes de enviarla a Drive.", 400);
  return { documentoId: doc.id, version: doc.version, storageKey: doc.storageKey, sha256: sourceHash(bytes), bytes: bytes.length, name: parsedName.data, mime, remoteId: doc.googleDriveId };
}
export async function caseDriveState(causaId: string, user: CausaAccessUser, options: Options = {}, documentoId?: string) {
  const db = options.client || prisma; await actor(causaId, user, db, false);
  const causa = await db.causa.findUniqueOrThrow({ where: { id: causaId }, select: { googleDriveFolderId: true, googleDriveFolderName: true, googleDriveFolderUrl: true } });
  let canConfigure = false; try { await actor(causaId, user, db); await assertNoOtherActiveOwner(causaId, user.id, db); canConfigure = true; } catch { /* Read access does not imply configuration rights. */ }
  const pending = await db.commandExecution.findMany({ where: { ownerId: user.id, key: { startsWith: operationPrefix(user.id, causaId) }, status: { in: ["running", "unknown"] } }, select: { id: true, key: true, status: true, resultJson: true, createdAt: true }, orderBy: { createdAt: "asc" }, take: 10 });
  let account: ManagedDriveAccount | null = null, reason: string | null = null;
  try { account = options.account || (await studyDriveMode(options.client) ? await resolveStudyDriveAccount(user, options.client) : await resolveAltazorDriveAccount(user, options)); } catch { reason = "No pudimos comprobar tu cuenta de Google de Altazor. Revisa su conexión."; }
  const pendingOperation = pending[0] ? (() => { let action = "upload-document", documentoId: string | undefined; try { const saved = JSON.parse(pending[0].resultJson || "{}"); action = saved.command?.action === "create_folder" ? "create-folder" : saved.command?.action === "save_version" ? "save-version" : "upload-document"; documentoId = saved.source?.documentoId; } catch { /* Incomplete records remain unknown. */ } return { requestId: pending[0].key.slice(operationPrefix(user.id, causaId).length), action, ...(documentoId ? { documentoId } : {}), state: pending[0].status === "running" && Date.now() - pending[0].createdAt.getTime() < 60_000 ? "pending" : "unknown", message: "Comprueba el resultado anterior antes de realizar otra operación." }; })() : undefined;
  const base = { causaId, caseRevision: await caseDriveRevision(causaId, db), account: account ? account.source || "altazor" as const : null, connected: Boolean(account), canRead: account?.canRead || false, canManage: account?.canManage || false, connectionId: account?.connectionId || null, bindingRevision: account?.bindingRevision || null, canConfigure, reason, folder: isRealDriveFolderId(causa.googleDriveFolderId) ? { id: causa.googleDriveFolderId!, name: causa.googleDriveFolderName || "Carpeta de la causa", url: driveFolderUrl(causa.googleDriveFolderId!) } : null, ...(pendingOperation ? { pendingOperation } : {}) };
  if (!documentoId) return base;
  const snapshot = await documentSnapshot(causaId, documentoId, user, db);
  const doc = await db.documento.findUniqueOrThrow({ where: { id: documentoId }, select: { googleDriveId: true } });
  let remoteId: string | undefined, remoteVersion: string | undefined, remoteTargetState: "none" | "ready" | "unavailable" | "outside_folder" = doc.googleDriveId ? "unavailable" : "none";
  if (account?.canRead && base.folder && doc.googleDriveId && isRealDriveFolderId(doc.googleDriveId)) {
    const io = await account.openTransport();
    try {
      const metadata = JSON.parse((await io.get(`/${doc.googleDriveId}?fields=id,version,parents,trashed,mimeType`, 32 * 1024)).toString("utf8"));
      if (metadata.id === doc.googleDriveId && metadata.trashed === false && Array.isArray(metadata.parents)) {
        if (!metadata.parents.includes(base.folder.id)) remoteTargetState = "outside_folder";
        else if (typeof metadata.version === "string" && /^\d{1,30}$/.test(metadata.version)) { remoteId = metadata.id; remoteVersion = metadata.version; remoteTargetState = "ready"; }
      }
    } catch { /* A missing remote object is never converted into an update. */ } finally { io.close(); }
  }
  const binding = await readAltazorDriveFolderBinding(causaId, db);
  const bound = Boolean(account && binding && (binding.source === "study" || binding.ownerId === user.id) && binding.accountId === account.connectionId && binding.accountRevision === account.bindingRevision && binding.proofRevision === account.proofRevision && binding.folderId === base.folder?.id);
  const canSave = Boolean(base.canManage && (base.canConfigure || account?.source === "study") && bound && ["none", "ready"].includes(remoteTargetState));
  return { ...base, document: { id: snapshot.documentoId, name: snapshot.name, version: snapshot.version, sourceSha256: snapshot.sha256, bytes: snapshot.bytes, mime: snapshot.mime, remoteTargetState, canSave, reason: remoteTargetState === "unavailable" ? "No se pudo comprobar el archivo de Drive. No se creará otro archivo en su lugar." : remoteTargetState === "outside_folder" ? "El archivo de Drive ya no pertenece a la carpeta de esta causa." : !bound ? "Vincula la carpeta con tu cuenta actual de Altazor antes de guardar." : null, ...(remoteId ? { remoteId, remoteVersion } : {}) } };
}
function publicResult(id: string, receipt: DriveWriteReceipt): CaseDriveResult {
  return receipt.action === "create_folder" ? { state: "completed", operationId: id, message: "Carpeta creada y vinculada a la causa.", folder: { id: receipt.file_id, name: receipt.name, url: driveFolderUrl(receipt.file_id) } }
    : { state: "completed", operationId: id, message: receipt.action === "save_version" ? "Nueva versión guardada como una copia. El archivo anterior se conserva." : "Copia exacta guardada en la carpeta de Drive.", file: { id: receipt.file_id, name: receipt.name, mime: receipt.mime, bytes: receipt.bytes, sha256: receipt.sha256, ...(receipt.previous_file_id ? { previousFileId: receipt.previous_file_id, previousVersion: receipt.previous_version } : {}) } };
}
async function assertSource(causaId: string, user: CausaAccessUser, saved: Saved, db: Db) {
  if (!saved.source) return;
  const current = await actor(causaId, user, db), source = saved.source;
  const doc = await db.documento.findFirst({ where: { AND: [{ id: source.documentoId, causaId, version: source.version, storageKey: source.storageKey, googleDriveId: source.remoteId, confidencial: false, privilegio: false }, documentReadWhere(current)] } });
  if (!doc) throw httpError("El documento cambió. La operación anterior se conserva para revisión.", 409);
}
async function assertReadableSource(causaId: string, user: CausaAccessUser, saved: Saved, db: Db) {
  if (!saved.source) return;
  const current = await actor(causaId, user, db);
  if (!await db.documento.count({ where: { AND: [{ id: saved.source.documentoId, causaId, confidencial: false, privilegio: false }, documentReadWhere(current)] } })) throw httpError("Documento no encontrado o sin acceso.", 404);
}
async function assertCaseState(causaId: string, saved: Saved, db: Db) {
  if (saved.binding) return;
  const [cause, subscription] = await Promise.all([db.causa.findUniqueOrThrow({ where: { id: causaId }, select: { googleDriveFolderId: true } }), db.driveSyncSubscription.findUnique({ where: { causaId }, select: { generation: true } })]);
  if (cause.googleDriveFolderId !== saved.caseFolderId || (subscription?.generation ?? null) !== saved.subscriptionGeneration) throw httpError("La carpeta de la causa cambió durante la operación. Revisa el resultado anterior.", 409);
}
export async function runCaseDriveCommand(causaId: string, user: CausaAccessUser, input: CaseDriveCommand, options: Options = {}): Promise<CaseDriveResult> {
  input = caseDriveCommandSchema.parse(input);
  const db = options.client || prisma; await actor(causaId, user, db);
  const account = await availableAccount(user, options);
  if (!account.canManage) throw httpError("Autoriza la gestión de archivos en Google Drive desde Altazor.", 403);
  if (account.connectionId !== input.connectionId || account.bindingRevision !== input.bindingRevision) throw httpError("La autorización de Drive cambió. Abre de nuevo esta acción.", 409);
  const key = operationPrefix(user.id, causaId) + input.requestId, inputHash = digest(canonicalJson({ causaId, input }));
  const previous = await db.commandExecution.findUnique({ where: { key } });
  if (previous && input.action !== "reconcile") {
    if (previous.ownerId !== user.id || previous.inputHash !== inputHash) throw httpError("La clave corresponde a otra operación.", 409);
    if (previous.status === "failed") throw httpError("La operación anterior se detuvo antes de enviar el archivo. Revisa los datos y prepara una nueva acción.", 409);
    const saved = JSON.parse(previous.resultJson || "null") as Saved | null;
    if (saved?.source) await assertReadableSource(causaId, user, saved, db);
    if (previous.status === "completed" && saved?.result) return saved.result;
    return { state: previous.status === "running" ? "pending" : "unknown", operationId: previous.id, message: "Comprueba el resultado anterior antes de encargar otra copia. No se repetirá automáticamente." };
  }
  if (input.action === "reconcile") {
    if (!previous || previous.ownerId !== user.id || !previous.resultJson) throw httpError("No se encontró la operación pendiente.", 404);
    const saved = JSON.parse(previous.resultJson) as Saved;
    if (saved.version !== 1 || saved.command.bindingRevision !== account.bindingRevision) throw httpError("La cuenta de la operación cambió. Revisa el resultado anterior.", 409);
    if (previous.status === "completed" && saved.result) { await assertReadableSource(causaId, user, saved, db); return saved.result; }
    await actor(causaId, user, db); await account.assertActive(db);
    const receipt = await account.reconcile(saved.command.request_id, { ...saved.command, expected_bytes: saved.bytes });
    if (!receipt) return { state: "unknown", operationId: previous.id, message: "Drive todavía no permite confirmar el resultado. No se reenviará la escritura." };
    if (receipt.state === "failed") {
      await db.commandExecution.updateMany({ where: { id: previous.id, ownerId: user.id, status: { in: ["running", "unknown"] } }, data: { status: "failed" } });
      return { state: "failed", operationId: previous.id, message: "Drive confirmó que la operación no se aplicó. Revisa los datos y prepara una nueva acción." };
    }
    if (saved.binding) await assertAltazorDriveFolderBinding(causaId, user, saved.binding, account, db);
    await assertSource(causaId, user, saved, db);
    await assertCaseState(causaId, saved, db);
    return commitVerified(previous.id, saved, receipt);
  }
  const unresolved = await db.commandExecution.count({ where: { ownerId: user.id, key: { startsWith: operationPrefix(user.id, causaId) }, status: { in: ["running", "unknown"] } } });
  if (unresolved) throw httpError("Hay una operación de Drive pendiente de comprobar en esta causa.", 409);
  if (input.caseRevision !== await caseDriveRevision(causaId, db)) throw httpError("La carpeta de la causa cambió. Revisa el destino antes de continuar.", 409);
  let source: Snapshot | undefined, binding: CaseDriveBinding | null = null, content: Buffer | null = null;
  if (input.action !== "create-folder") {
    binding = await readAltazorDriveFolderBinding(causaId, db);
    if (!binding) throw httpError("Vincula primero una carpeta con tu cuenta de Altazor.", 409);
    await assertAltazorDriveFolderBinding(causaId, user, binding, account, db);
    source = await documentSnapshot(causaId, input.documentoId, user, db);
    if (input.action === "upload-document" && source.remoteId) throw httpError("Este documento ya tiene un archivo de Drive. Comprueba su destino para guardar una nueva versión.", 409);
    if (input.action === "save-version" && source.remoteId !== input.fileId) throw httpError("El archivo de Drive ya no coincide con el documento seleccionado.", 409);
    if (source.version !== input.documentVersion || source.sha256 !== input.sourceSha256) throw httpError("El documento cambió. Revisa la vista previa antes de copiarlo.", 409);
    content = await getObjectBounded(source.storageKey, DRIVE_WRITE_MAX_BYTES);
    if (!content || sourceHash(content) !== source.sha256) throw httpError("El archivo cambió durante la preparación.", 409);
  }
  const command: DriveWriteCommand = { request_id: digest(key), context_key: digest(canonicalJson({ ownerId: user.id, causaId, input, source, binding })), bindingRevision: account.bindingRevision, action: input.action === "create-folder" ? "create_folder" : input.action === "save-version" ? "save_version" : "upload_file", folder_id: input.action === "create-folder" ? input.parentFolderId || "root" : binding!.folderId, name: input.nombre || source!.name, ...(source ? { mime: source.mime, sha256: source.sha256 } : {}), ...(input.action === "save-version" ? { file_id: input.fileId, expected_version: input.expectedVersion } : {}), confirmed: true };
  const [causeBefore, subscriptionBefore] = await Promise.all([db.causa.findUniqueOrThrow({ where: { id: causaId }, select: { googleDriveFolderId: true } }), db.driveSyncSubscription.findUnique({ where: { causaId }, select: { generation: true } })]);
  const saved: Saved = { version: 1, binding, command, bytes: source?.bytes || 0, caseFolderId: causeBefore.googleDriveFolderId, subscriptionGeneration: subscriptionBefore?.generation ?? null, ...(source ? { source } : {}) };
  await assertCommandAuthorization(options);
  let claimed;
  try {
    claimed = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Causa" WHERE id = ${causaId} FOR UPDATE`;
      await actor(causaId, user, tx); await account.assertActive(tx);
      if (input.action === "create-folder" || account.source !== "study") await assertNoOtherActiveOwner(causaId, user.id, tx);
      if (input.caseRevision !== await caseDriveRevision(causaId, tx)) throw httpError("La carpeta de la causa cambió. Revisa el destino antes de continuar.", 409);
      if (binding) await assertAltazorDriveFolderBinding(causaId, user, binding, account, tx);
      await assertCaseState(causaId, saved, tx);
      await assertSource(causaId, user, saved, tx);
      if (await tx.commandExecution.count({ where: { ownerId: user.id, key: { startsWith: operationPrefix(user.id, causaId) }, status: { in: ["running", "unknown"] } } })) throw httpError("Hay una operación de Drive pendiente de comprobar en esta causa.", 409);
      return tx.commandExecution.create({ data: { key, ownerId: user.id, inputHash, status: "running", resultJson: canonicalJson(saved) } });
    });
  } catch (error) {
    if ((error as { code?: string }).code === "P2002") throw httpError("Esta operación ya está registrada. Comprueba su resultado sin reenviarla.", 409);
    throw error;
  }
  try {
    const receipt = await account.command({ ...command, ...(content ? { content_base64: content.toString("base64") } : {}) }, async () => {
      await actor(causaId, user, db); await account.assertActive(db);
      if (input.caseRevision !== await caseDriveRevision(causaId, db)) throw httpError("La carpeta de la causa cambió.", 409);
      if (saved.binding) await assertAltazorDriveFolderBinding(causaId, user, saved.binding, account, db);
      await assertSource(causaId, user, saved, db);
      // The assistant turn/lease and cancellation signal are checked outside
      // every transaction, after all preparation and immediately before RPC.
      await assertCommandAuthorization(options);
    });
    return await commitVerified(claimed.id, saved, receipt);
  } catch (error) {
    if ((error as { code?: string }).code === "drive_prewrite_denied") {
      await db.commandExecution.updateMany({ where: { id: claimed.id, ownerId: user.id, status: "running" }, data: { status: "failed" } });
      throw error;
    }
    await db.commandExecution.updateMany({ where: { id: claimed.id, ownerId: user.id, status: "running" }, data: { status: "unknown" } });
    return { state: "unknown", operationId: claimed.id, message: "No pudimos confirmar el resultado. Compruébalo antes de continuar; la escritura no se repetirá automáticamente." };
  }
  async function commitVerified(operationId: string, saved: Saved, receipt: DriveWriteReceipt): Promise<CaseDriveResult> {
    const result = publicResult(operationId, receipt);
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "Causa" WHERE id = ${causaId} FOR UPDATE`;
      await actor(causaId, user, tx); await account.assertActive(tx);
      if (saved.binding) await assertAltazorDriveFolderBinding(causaId, user, saved.binding, account, tx);
      await assertCaseState(causaId, saved, tx);
      await assertSource(causaId, user, saved, tx);
      if (receipt.action === "create_folder") await storeFolder(causaId, user, account, { id: receipt.file_id, name: receipt.name }, tx);
      else if (saved.source) await tx.documento.update({ where: { id: saved.source.documentoId }, data: { googleDriveId: receipt.file_id } });
      await writeAuditStrict({ actorId: user.id, action: `case.drive.${receipt.action}`, entityType: "Causa", entityId: causaId, after: { fileId: receipt.file_id, folderId: receipt.folder_id, sourceSha256: receipt.sha256, sourceVersion: saved.source?.version, previousFileId: receipt.previous_file_id } }, tx);
      const updated = await tx.commandExecution.updateMany({ where: { id: operationId, ownerId: user.id, status: { in: ["running", "unknown"] } }, data: { status: "completed", resultJson: canonicalJson({ ...saved, result }) } });
      if (!updated.count) throw httpError("La operación cambió durante la comprobación.", 409);
    });
    return result;
  }
}
export const getCaseDriveState = caseDriveState;
export const executeCaseDriveCommand = runCaseDriveCommand;
