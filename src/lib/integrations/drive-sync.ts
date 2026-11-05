/** Opt-in folder pull. Owner-bound account sessions stay on the server. */
import { randomUUID, createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertCausaAccess, assertCausaCapability, type CausaAccessUser } from "@/lib/auth/causa-access";
import { importSelectedDriveFile, listDriveImportCandidates, type DriveImportDependencies, inspectChosenDriveFolder, listDriveFoldersWithSession } from "./drive-import";
import { isRealDriveFolderId, parseGoogleDriveFolderRef } from "./drive-folder";

const LEASE_MS = 10 * 60_000;
const MAX_INSPECTED = 150;
const MAX_IMPORTED = 20;
function error(message: string, status = 409) { return Object.assign(new Error(message), { status }); }
type AccountChoice = "study" | "personal";
async function studyConnection(client: PrismaClient | Prisma.TransactionClient) {
  const row = await client.integrationConfig.findUnique({ where: { provider: "google" }, select: { id: true, enabled: true, configJson: true } });
  try { const config = JSON.parse(row?.configJson || "{}"); const configured = row?.enabled === true && typeof config.accessToken === "string" && Boolean(config.accessToken) && config.syncDrive !== false; return { configured, connectionId: configured ? createHash("sha256").update(JSON.stringify([row!.id, config.connectedEmail || "study"])).digest("hex") : null }; } catch { return { configured: false, connectionId: null }; }
}
async function choices(userId: string, client: PrismaClient) {
  const { personalDriveConnectionStatus } = await import("@/lib/personal-connectors/google-drive/service");
  const [study, personal] = await Promise.all([studyConnection(client), personalDriveConnectionStatus(userId, { client }).catch(() => ({ connected: false, configured: false, label: "Mi cuenta de Google", connectionId: null, reason: "Conecte su cuenta personal desde Conexiones." }))]);
  return { study, personal };
}
function publicState(row: { enabled: boolean; intervalMinutes: number; lastRunAt: Date | null; status: string; note: string | null; ownerId: string; account: string } | null, actorId: string) {
  return row ? { enabled: row.enabled, intervalMinutes: row.intervalMinutes, lastRunAt: row.lastRunAt?.toISOString() || null, status: row.status, note: row.note, canConfigure: row.ownerId === actorId || !row.enabled, account: row.account === "personal" ? "personal" as const : "study" as const } : { enabled: false, intervalMinutes: 60, lastRunAt: null, status: "idle", note: null, canConfigure: true, account: "study" as const };
}
export async function getDriveSyncSettings(causaId: string, user: CausaAccessUser, client = prisma) {
  await assertCausaAccess(causaId, user, { auditOverride: false }, client);
  const [row, accounts] = await Promise.all([client.driveSyncSubscription.findUnique({ where: { causaId } }), choices(user.id, client)]);
  return { ...publicState(row, user.id), accounts: { study: { configured: accounts.study.configured }, personal: { connected: accounts.personal.connected, label: accounts.personal.label, reason: accounts.personal.reason } } };
}
export async function configureDriveSync(causaId: string, user: CausaAccessUser, input: { enabled: boolean; intervalMinutes: number; account: AccountChoice }, client = prisma) {
  if (!["study", "personal"].includes(input.account) || ![15, 30, 60, 180, 360, 1440].includes(input.intervalMinutes)) throw error("Seleccione una frecuencia y una cuenta disponible.", 400);
  const accounts = await choices(user.id, client);
  if (input.enabled && input.account === "personal" && !accounts.personal.connected) throw error("Conecte su Google Drive personal y autorice la lectura de documentos antes de activar esta carpeta.", 409);
  const connectionId = input.account === "personal" ? accounts.personal.connectionId : accounts.study.connectionId;
  const row = await client.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Causa" WHERE id = ${causaId} FOR UPDATE`;
    const actor = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
    await assertCausaCapability(causaId, actor, "causa.write", tx);
    const causa = await tx.causa.findUniqueOrThrow({ where: { id: causaId }, select: { googleDriveFolderId: true } });
    if (!isRealDriveFolderId(causa.googleDriveFolderId)) throw error("Primero elija una carpeta de Drive para esta causa.");
    const prior = await tx.driveSyncSubscription.findUnique({ where: { causaId } });
    if (prior && prior.ownerId !== user.id && prior.enabled) throw error("La sincronización fue activada por otro profesional. Solicite que la desactive antes de reemplazarla.", 403);
    if (input.enabled && input.account === "personal" && connectionId) { const { assertPersonalDriveConnection } = await import("@/lib/personal-connectors/google-drive/service"); await assertPersonalDriveConnection(user.id, connectionId, tx); }
    return tx.driveSyncSubscription.upsert({ where: { causaId }, create: { causaId, ownerId: user.id, account: input.account, connectionId, folderId: causa.googleDriveFolderId!, enabled: input.enabled, intervalMinutes: input.intervalMinutes, nextRunAt: input.enabled ? new Date() : null }, update: { ownerId: user.id, account: input.account, connectionId, enabled: input.enabled, intervalMinutes: input.intervalMinutes, folderId: causa.googleDriveFolderId!, generation: { increment: 1 }, scanCursor: null, nextRunAt: input.enabled ? new Date() : null, leaseToken: null, leaseExpiresAt: null, status: input.enabled ? "idle" : "paused", note: null } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
  return { ...publicState(row, user.id), accounts: { study: { configured: accounts.study.configured }, personal: { connected: accounts.personal.connected, label: accounts.personal.label, reason: accounts.personal.reason } } };
}
/** Manual lists/imports use the selected account and never borrow another professional's connection. */
export async function driveImportDependenciesForActor(causaId: string, user: CausaAccessUser, client = prisma): Promise<DriveImportDependencies> {
  await assertCausaAccess(causaId, user, { auditOverride: false }, client);
  const selected = await client.driveSyncSubscription.findUnique({ where: { causaId } });
  if (selected?.account !== "personal") return { client };
  if (selected.ownerId !== user.id || !selected.connectionId) throw error("La carpeta usa una conexión personal de otro profesional. Sus copias guardadas están disponibles en el expediente.", 403);
  const expected = selected.connectionId;
  const { requirePersonalDriveSession, assertPersonalDriveConnection } = await import("@/lib/personal-connectors/google-drive/service");
  return {
    client,
    session: () => requirePersonalDriveSession(user.id, { client }),
    assertActive: async db => {
      const actor = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
      await assertCausaAccess(causaId, actor, { auditOverride: false }, db);
      const current = await db.driveSyncSubscription.findUnique({ where: { causaId } });
      if (!current || current.account !== "personal" || current.ownerId !== user.id || current.connectionId !== expected) throw error("La cuenta elegida cambió. Abra nuevamente los archivos de Drive.");
      await assertPersonalDriveConnection(user.id, expected, db);
    },
  };
}
export async function listPersonalDriveFolders(causaId: string, user: CausaAccessUser, input: { parentId?: string; query?: string; pageToken?: string; connectionId?: string }, options: DriveImportDependencies = {}) {
  const client = options.client || prisma;
  const current = await client.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
  await assertCausaCapability(causaId, current, "causa.write", client);
  const { requirePersonalDriveSession, assertPersonalDriveConnection } = await import("@/lib/personal-connectors/google-drive/service");
  const session = await requirePersonalDriveSession(user.id, { client });
  if (input.connectionId && input.connectionId !== session.connectionId) throw error("La cuenta de Google cambió. Abra nuevamente el selector de carpetas.");
  const guard = async (db: PrismaClient | Prisma.TransactionClient) => {
    const actor = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
    await assertCausaCapability(causaId, actor, "causa.write", db);
    await assertPersonalDriveConnection(user.id, session.connectionId, db);
  };
  const data = await listDriveFoldersWithSession(session, input, { ...options, client, assertActive: guard });
  await guard(client);
  return { ...data, connectionId: session.connectionId };
}
/** A personal Drive folder can be linked without configuring the study's Google identity. */
export async function linkPersonalDriveFolder(causaId: string, user: CausaAccessUser, folderRef: string, options: DriveImportDependencies & { connectionId?: string } = {}) {
  const client = options.client || prisma;
  const actor = await client.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
  await assertCausaCapability(causaId, actor, "causa.write", client);
  const folder = parseGoogleDriveFolderRef(folderRef);
  if (!folder || !isRealDriveFolderId(folder.folderId)) throw error("Pegue el enlace de una carpeta de Google Drive.", 400);
  const { requirePersonalDriveSession, assertPersonalDriveConnection } = await import("@/lib/personal-connectors/google-drive/service");
  const session = await requirePersonalDriveSession(user.id, { client });
  if (options.connectionId && options.connectionId !== session.connectionId) throw error("La cuenta de Google cambió. Abra nuevamente el selector de carpetas.");
  const metadata = await inspectChosenDriveFolder(folder.folderId, session, options);
  await client.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "Causa" WHERE id = ${causaId} FOR UPDATE`;
    const current = await tx.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
    await assertCausaCapability(causaId, current, "causa.write", tx);
    await assertPersonalDriveConnection(user.id, session.connectionId, tx);
    await tx.causa.update({ where: { id: causaId }, data: { googleDriveFolderId: metadata.id, googleDriveFolderName: metadata.name, googleDriveFolderUrl: folder.folderUrl } });
    await tx.driveSyncSubscription.upsert({ where: { causaId }, create: { causaId, ownerId: user.id, folderId: metadata.id, account: "personal", connectionId: session.connectionId, enabled: false, status: "paused" }, update: { ownerId: user.id, folderId: metadata.id, enabled: false, generation: { increment: 1 }, account: "personal", connectionId: session.connectionId, status: "paused", nextRunAt: null, scanCursor: null, leaseToken: null, leaseExpiresAt: null, note: "Carpeta personal elegida. Active su actualización cuando esté listo." } });
  });
  return { status: "linked", message: "Carpeta de su Google Drive vinculada. Puede activar la actualización automática.", folder: metadata };
}
const MAX_FOLDERS = 250, MAX_DEPTH = 8;
const FOLDER_ID = /^[A-Za-z0-9_-]{10,200}$/;
type Folder = { id: string; depth: number };
type ScanCursor = { folder: Folder; pageToken?: string; index: number; queue: Folder[]; seen: string[]; limited: boolean };
function cursor(value: string | null, rootId: string): ScanCursor {
  const fresh = () => ({ folder: { id: rootId, depth: 0 }, index: 0, queue: [], seen: [rootId], limited: false });
  try {
    if (!value || value.length > 100_000) return fresh();
    const parsed = JSON.parse(value);
    const validFolder = (folder: Folder) => folder && FOLDER_ID.test(folder.id) && Number.isInteger(folder.depth) && folder.depth >= 0 && folder.depth <= MAX_DEPTH;
    if (!validFolder(parsed.folder) || !Array.isArray(parsed.queue) || parsed.queue.length > MAX_FOLDERS || !parsed.queue.every(validFolder) || !Array.isArray(parsed.seen) || parsed.seen.length > MAX_FOLDERS || !parsed.seen.every((id: string) => FOLDER_ID.test(id)) || (parsed.pageToken && (typeof parsed.pageToken !== "string" || parsed.pageToken.length > 2048)) || !Number.isInteger(parsed.index) || parsed.index < 0 || parsed.index > 50) return fresh();
    return { ...parsed, limited: parsed.limited === true };
  } catch { return fresh(); }
}
function nextFolder(position: ScanCursor) {
  const next = position.queue.shift();
  if (!next) return false;
  position.folder = next; position.index = 0; delete position.pageToken; return true;
}
/** Scheduler entrypoint: call at least every 15 minutes while the Host is running. */
export async function processDueDriveSyncSubscriptions(options: DriveImportDependencies & { limit?: number; now?: Date; causaId?: string } = {}) {
  const client = options.client || prisma, now = options.now || new Date();
  const due = await client.driveSyncSubscription.findMany({ where: { enabled: true, nextRunAt: { lte: now }, ...(options.causaId ? { causaId: options.causaId } : {}), OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }] }, orderBy: [{ nextRunAt: "asc" }, { id: "asc" }], take: Math.max(1, Math.min(options.limit ?? 4, 10)) });
  const receipts = [];
  for (const selected of due) {
    const leaseToken = randomUUID();
    const claimed = await client.driveSyncSubscription.updateMany({ where: { id: selected.id, enabled: true, generation: selected.generation, OR: [{ leaseExpiresAt: null }, { leaseExpiresAt: { lte: now } }] }, data: { leaseToken, leaseExpiresAt: new Date(now.getTime() + LEASE_MS), status: "running" } });
    if (!claimed.count) continue;
    let imported = 0, unchanged = 0, unavailable = 0, removed = 0, inspected = 0;
    const position = cursor(selected.scanCursor, selected.folderId); let complete = false;
    let note = "", status = "ok";
    try {
      const user = await client.user.findUniqueOrThrow({ where: { id: selected.ownerId }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
      const guard = async (db: PrismaClient | Prisma.TransactionClient) => {
        const row = await db.driveSyncSubscription.findUnique({ where: { id: selected.id }, include: { causa: { select: { googleDriveFolderId: true } } } });
        if (!row || !row.enabled || row.leaseToken !== leaseToken || row.generation !== selected.generation || row.account !== selected.account || row.connectionId !== selected.connectionId || row.folderId !== selected.folderId || row.causa.googleDriveFolderId !== selected.folderId || !row.leaseExpiresAt || row.leaseExpiresAt <= new Date()) throw error("La sincronización cambió o fue pausada. Se conservaron las copias guardadas.");
        const actor = await db.user.findUniqueOrThrow({ where: { id: user.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
        await assertCausaCapability(selected.causaId, actor, "causa.write", db);
        if (selected.account === "personal") {
          if (!selected.connectionId) throw error("Vuelva a activar esta carpeta con su cuenta personal.");
          const { assertPersonalDriveConnection } = await import("@/lib/personal-connectors/google-drive/service");
          await assertPersonalDriveConnection(selected.ownerId, selected.connectionId, db);
        } else if (!options.session) {
          const current = await studyConnection(db);
          if (!current.configured || current.connectionId !== selected.connectionId) throw error("La cuenta del estudio cambió. Vuelva a activar la carpeta.");
        }
      };
      while (inspected < MAX_INSPECTED && imported < MAX_IMPORTED) {
        await guard(client);
        const session = selected.account === "personal" ? async () => { const { requirePersonalDriveSession } = await import("@/lib/personal-connectors/google-drive/service"); return requirePersonalDriveSession(selected.ownerId, { client }); } : options.session;
        const deps = { ...options, session, client, assertActive: guard, sourceFolderId: position.folder.id };
        let page;
        try { page = await listDriveImportCandidates(selected.causaId, user, position.pageToken, deps); }
        catch (cause) {
          await guard(client);
          if (position.folder.id !== selected.folderId && [403, 404, 409].includes((cause as { status?: number }).status || 0)) {
            unavailable++; position.limited = true;
            if (nextFolder(position)) continue;
            complete = true; break;
          }
          throw cause;
        }
        if (page.incompleteSearch) throw error("Drive no pudo confirmar todos los archivos. Se conservarán las copias; volveremos a revisar.");
        let index = position.index;
        for (; index < page.files.length && inspected < MAX_INSPECTED && imported < MAX_IMPORTED; index++) {
          await guard(client); inspected++;
          const file = page.files[index];
          if (file.mimeType === "application/vnd.google-apps.folder") {
            if (!position.seen.includes(file.id)) {
              if (position.folder.depth >= MAX_DEPTH || position.seen.length >= MAX_FOLDERS) position.limited = true;
              else { position.seen.push(file.id); position.queue.push({ id: file.id, depth: position.folder.depth + 1 }); }
            }
            continue;
          }
          if (!file.importable || !file.version) { unavailable++; continue; }
          try {
            const result = await importSelectedDriveFile({ causaId: selected.causaId, folderId: selected.folderId, fileId: file.id, version: file.version }, user, deps);
            if (result.reused) unchanged++; else imported++;
          } catch (cause) {
            // A file that changed or cannot be imported must not block later files.
            if ((cause as { code?: string }).code === "drive_import_removed") { await guard(client); removed++; }
            else if ([403, 404, 409, 413, 422].includes((cause as { status?: number }).status || 0)) { await guard(client); unavailable++; if ([403,404].includes((cause as { status?: number }).status || 0)) position.limited = true; }
            else throw cause;
          }
        }
        position.index = index;
        if (index < page.files.length) break;
        if (page.nextPageToken) { position.pageToken = page.nextPageToken; position.index = 0; continue; }
        if (nextFolder(position)) continue;
        complete = true; break;
      }
      if (position.limited) status = "partial";
      note = `${imported} archivos nuevos · ${unchanged} ya guardados${unavailable ? ` · ${unavailable} no admitidos` : ""}${removed ? ` · ${removed} revisiones eliminadas previamente` : ""}${complete ? "" : ". Continuaremos con los archivos restantes."}${position.limited ? ". Algunas subcarpetas no pudieron revisarse o superan el límite; elija una carpeta más cercana para incluirlas." : ""}`;
    } catch (cause) {
      status = "attention";
      // Never persist access tokens, signed URLs or provider response bodies.
      note = "No pudimos completar la actualización. Revise la conexión, la carpeta y sus permisos; las copias anteriores se conservan.";
      const connection = selected.account === "personal" ? (await choices(selected.ownerId, client)).personal : await studyConnection(client);
      const connected = "connected" in connection ? connection.connected : connection.configured;
      if ((!options.session || selected.account === "personal") && (!connected || connection.connectionId !== selected.connectionId)) {
        await client.driveSyncSubscription.updateMany({ where: { id: selected.id, leaseToken, generation: selected.generation }, data: { enabled: false, generation: { increment: 1 }, status: "paused", note: "La conexión cambió. Elija su cuenta y vuelva a activar esta carpeta.", nextRunAt: null, scanCursor: null, leaseToken: null, leaseExpiresAt: null } });
      }
      if ((cause as { code?: string }).code === "drive_invalid_cursor") { delete position.pageToken; position.index = 0; }
    }
    const finished = new Date();
    await client.driveSyncSubscription.updateMany({ where: { id: selected.id, leaseToken, generation: selected.generation }, data: { status, note, lastRunAt: finished, nextRunAt: new Date(finished.getTime() + (complete || status !== "ok" ? selected.intervalMinutes : 1) * 60_000), scanCursor: complete ? null : JSON.stringify(position), leaseToken: null, leaseExpiresAt: null } });
    receipts.push({ causaId: selected.causaId, status, imported, unchanged, unavailable, removed, complete });
  }
  return receipts;
}
