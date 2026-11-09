import type { Prisma } from "@prisma/client";
import { isStaff } from "@/lib/auth/rbac";
/** Server-side adapter for the one Google account administered by the Host. */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { digest } from "@/lib/personal-connectors/core";
import { canonicalJson } from "@/lib/command-execution";
import { getGoogleConfig, requireDriveSession } from "./google";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import type { DriveWriteCommand, DriveWriteReceipt, ManagedDriveAccount } from "@/lib/altazor/connectors/drive-management";
const API = "https://www.googleapis.com/drive/v3/files";
const ID = /^[A-Za-z0-9_-]{10,200}$/;
function commandHash(command: DriveWriteCommand) {
  const { request_id, context_key, bindingRevision, action, folder_id, file_id, name, mime, sha256, expected_version, confirmed } = command;
  return digest(canonicalJson({ request_id, context_key, bindingRevision, action, folder_id, file_id, name, mime, sha256, expected_version, confirmed }));
}
export const STUDY_ORGANIZATION_KEY = "google-organization-root:study";
export async function studyDriveMode(db = prisma) { return Boolean(await db.commandExecution.findUnique({ where: { key: STUDY_ORGANIZATION_KEY }, select: { id: true } })); }
export async function resolveStudyDriveAccount(user: CausaAccessUser, db = prisma, fetcher: typeof fetch = fetch): Promise<ManagedDriveAccount> {
  const initial = await requireDriveSession(), row = await db.integrationConfig.findUniqueOrThrow({ where: { provider: "google" } });
  const connectionId = createHash("sha256").update(JSON.stringify([row.id, initial.connectedEmail || "study"])).digest("hex");
  const revision = (config: typeof initial) => digest(canonicalJson({ row: row.id, refresh: config.refreshToken || "", email: config.connectedEmail || "", scopes: [...config.scopes].sort() }));
  const bindingRevision = revision(initial);
  async function assertActive(client: typeof prisma | Prisma.TransactionClient = db) {
    const actor = await client.user.findUnique({ where: { id: user.id }, select: { role: true } });
    if (!actor || !isStaff(actor.role)) throw httpError("Cuenta del equipo requerida", 403);
    const current = await client.integrationConfig.findUnique({ where: { provider: "google" } });
    if (!current?.enabled || revision(await getGoogleConfig()) !== bindingRevision) throw httpError("La conexión de Google del estudio cambió", 409);
  }
  async function request(url: string, init: RequestInit = {}, max = 256 * 1024) {
    await assertActive(); const config = await requireDriveSession();
    const response = await fetcher(url, { ...init, headers: { ...Object.fromEntries(new Headers(init.headers)), Authorization: `Bearer ${config.accessToken}` }, redirect: "error", signal: AbortSignal.timeout(60_000) });
    if (response.status === 404 && init.method !== "POST") { await response.body?.cancel(); return null; }
    if (!response.ok) { await response.body?.cancel(); throw Object.assign(httpError("Google no confirmó la operación. Revisa la cuenta del estudio y sus permisos", response.status === 403 ? 403 : 502), { googleRejected: [400, 401, 403, 404].includes(response.status) }); }
    const reader = response.body?.getReader(); if (!reader) throw httpError("Respuesta vacía de Google", 502);
    const chunks: Uint8Array[] = []; let bytes = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break; bytes += part.value.byteLength; if (bytes > max) { await reader.cancel(); throw httpError("Respuesta de Google demasiado grande", 502); } chunks.push(part.value); } } finally { reader.releaseLock(); }
    await assertActive(); return Buffer.concat(chunks, bytes);
  }
  async function receipt(command: DriveWriteCommand & { expected_bytes?: number }): Promise<DriveWriteReceipt | null> {
    if (command.bindingRevision !== bindingRevision) throw httpError("La autorización de la operación cambió; revisa su resultado anterior", 409);
    const entry = await db.commandExecution.findUnique({ where: { key: `google-study-write:${command.request_id}` } });
    if (!entry?.resultJson) return null;
    if (entry.inputHash !== commandHash(command)) throw httpError("La operación no coincide con la registrada", 409);
    const saved = JSON.parse(entry.resultJson) as { id: string; bytes: number; sha256?: string };
    if (command.expected_bytes !== undefined && command.expected_bytes !== saved.bytes) throw httpError("El tamaño esperado cambió", 409);
    const bytes = await request(`${API}/${saved.id}?fields=id,name,mimeType,parents,trashed,size,md5Checksum,appProperties&supportsAllDrives=true`);
    if (!bytes) return null;
    const file = JSON.parse(bytes.toString("utf8"));
    const content = saved.sha256 ? await request(`${API}/${saved.id}?alt=media&supportsAllDrives=true`, {}, 4 * 1024 * 1024) : null;
    if (saved.sha256 && (!content || content.length !== saved.bytes || createHash("sha256").update(content).digest("hex") !== saved.sha256)) throw httpError("Los bytes guardados en Drive no coinciden con el original", 409);
    if (file.id !== saved.id || file.trashed !== false || file.name !== command.name || !file.parents?.includes(command.folder_id) || file.appProperties?.lexopenRequest !== command.request_id || file.appProperties?.lexopenContext !== command.context_key || file.mimeType !== (command.mime || "application/vnd.google-apps.folder") || content && (file.size !== String(content.length) || file.md5Checksum !== createHash("md5").update(content).digest("hex"))) throw httpError("Drive no confirmó el archivo y su destino", 409);
    await db.commandExecution.updateMany({ where: { id: entry.id, status: "running" }, data: { status: "completed" } });
    return { schema: "lexopen-drive-write.v1", state: "drive_verified", request_id: command.request_id, context_key: command.context_key, account_revision: bindingRevision, alias: "study", action: command.action, folder_id: command.folder_id, file_id: file.id, name: file.name, mime: file.mimeType, bytes: content?.length || Number(file.size || 0), ...(command.sha256 ? { sha256: command.sha256 } : {}), ...(command.action === "save_version" ? { previous_file_id: command.file_id, previous_version: command.expected_version } : {}) };
  }
  return { source: "study", ownerId: user.id, workspaceId: "study", connectionId, bindingRevision, proofRevision: bindingRevision, canRead: true, canManage: true, assertActive,
    async openTransport() { return { close() {}, async get(path, max) { if (!path.startsWith("/") && !path.startsWith("?")) throw httpError("Ruta Drive inválida", 400); const data = await request(API + path, {}, max); if (!data) throw httpError("Carpeta o archivo no encontrado en Drive", 404); return data; } }; },
    async command(command, beforeWrite) {
      if (command.bindingRevision !== bindingRevision || !ID.test(command.folder_id) && command.folder_id !== "root") throw httpError("La cuenta o el destino cambió", 409);
      const key = `google-study-write:${command.request_id}`;
      const authorize = async () => {
        try { await assertActive(); await beforeWrite?.(); }
        catch {
          await db.commandExecution.updateMany({ where: { key, status: "running" }, data: { status: "failed" } });
          throw Object.assign(httpError("La autorización o el destino cambió antes del envío", 409), { code: "drive_prewrite_denied" });
        }
      };
      if (await db.commandExecution.findUnique({ where: { key } })) { const prior = await receipt(command); if (prior) return prior; throw httpError("La escritura anterior sigue sin confirmación; no se reenviará", 409); }
      if (command.action === "save_version") {
        const original = await request(`${API}/${command.file_id}?fields=id,version,parents,trashed&supportsAllDrives=true`);
        const file = original ? JSON.parse(original.toString("utf8")) : null;
        if (!file || file.trashed !== false || file.version !== command.expected_version || !file.parents?.includes(command.folder_id)) throw httpError("La versión anterior o su carpeta cambió", 409);
      }
      await authorize();
      const reserved = await request(`${API}/generateIds?count=1&space=drive&type=files`);
      const id = reserved ? JSON.parse(reserved.toString("utf8")).ids?.[0] : null;
      if (typeof id !== "string" || !ID.test(id)) throw httpError("Google no reservó un identificador", 502);
      await db.commandExecution.create({ data: { key, ownerId: user.id, inputHash: commandHash(command), status: "running", resultJson: canonicalJson({ id, bytes: command.content_base64 ? Buffer.from(command.content_base64, "base64").length : 0, sha256: command.sha256 }) } });
      await authorize();
      const metadata = { id, name: command.name, mimeType: command.mime || "application/vnd.google-apps.folder", parents: [command.folder_id], appProperties: { lexopenRequest: command.request_id, lexopenContext: command.context_key } };
      try {
      if (command.content_base64) {
        const content = Buffer.from(command.content_base64, "base64");
        if (content.length > 4 * 1024 * 1024 || createHash("sha256").update(content).digest("hex") !== command.sha256) throw httpError("El documento no coincide con su comprobación", 409);
        const boundary = `lexopen_${command.request_id}`;
        const body = Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: ${command.mime}\r\n\r\n`), content, Buffer.from(`\r\n--${boundary}--\r\n`)]);
        await request("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true", { method: "POST", headers: { "Content-Type": `multipart/related; boundary=${boundary}` }, body: new Uint8Array(body) });
      } else await request(`${API}?supportsAllDrives=true`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(metadata) });
      } catch (error) {
        if ((error as { googleRejected?: boolean }).googleRejected) await db.commandExecution.updateMany({ where: { key, status: "running" }, data: { status: "failed" } });
        throw error;
      }
      const verified = await receipt(command); if (!verified) throw httpError("Drive todavía no confirma la creación", 502); return verified;
    }, async reconcile(requestId, expected) {
      await assertActive();
      if (requestId !== expected.request_id) throw httpError("Operación inválida", 400);
      const row = await db.commandExecution.findUnique({ where: { key: `google-study-write:${expected.request_id}` } });
      if (row?.status === "failed" && row.inputHash === commandHash(expected)) return { state: "failed" as const };
      return receipt(expected);
    },
  };
}
