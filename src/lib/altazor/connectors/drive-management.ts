/** Owner-bound Drive RPC. Provider credentials never leave the dedicated motor. */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { ConnectorError, unseal } from "@/lib/personal-connectors/core";
import { endpointFor } from "../computer/policy";
import { resolveGoogleDriveAccountBinding } from "./easy-oauth";
import type { DriveReadTransport } from "@/lib/integrations/drive-import";

type Db = typeof prisma | Prisma.TransactionClient;
export type DriveManagementOptions = { client?: typeof prisma; fetcher?: typeof fetch };
export const DRIVE_WRITE_MAX_BYTES = 4 * 1024 * 1024;
const hex = /^[a-f0-9]{64}$/, id = /^[A-Za-z0-9_-]{10,200}$/;
const hash = (bytes: Buffer) => createHash("sha256").update(bytes).digest("hex");
const failure = (code: string, message: string, status = 409) => new ConnectorError(code, message, status);
export type DriveWriteCommand = {
  request_id: string; context_key: string; bindingRevision: string;
  action: "create_folder" | "upload_file" | "save_version"; folder_id: string;
  file_id?: string; name: string; mime?: string; content_base64?: string;
  sha256?: string; expected_version?: string; confirmed: true;
};
type DriveWriteExpected = DriveWriteCommand & { expected_bytes?: number };
export type DriveWriteReceipt = {
  schema: "lexopen-drive-write.v1"; state: "drive_verified"; request_id: string;
  context_key: string; account_revision: string; alias: string;
  action: DriveWriteCommand["action"]; folder_id: string; parent_id?: string;
  file_id: string; name: string; mime: string; bytes: number; sha256?: string;
  previous_file_id?: string; previous_version?: string;
};
export type ManagedDriveAccount = {
  ownerId: string; workspaceId: string; connectionId: string; bindingRevision: string;
  canRead: boolean; canManage: boolean; proofRevision: string;
  assertActive(db?: Db): Promise<void>;
  openTransport(): Promise<DriveReadTransport>;
  command(input: DriveWriteCommand, beforeWrite?: () => Promise<void>): Promise<DriveWriteReceipt>;
  reconcile(requestId: string, expected: DriveWriteExpected): Promise<DriveWriteReceipt | { state: "failed" } | null>;
};

export function verifyDriveWriteReceipt(value: unknown, command: DriveWriteExpected, alias: string): DriveWriteReceipt {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw failure("drive_receipt_invalid", "No se pudo verificar el resultado de Drive.", 502);
  const receipt = value as DriveWriteReceipt;
  if (receipt.schema !== "lexopen-drive-write.v1" || receipt.state !== "drive_verified" || receipt.request_id !== command.request_id ||
      receipt.context_key !== command.context_key || receipt.account_revision !== command.bindingRevision || receipt.alias !== alias ||
      receipt.action !== command.action || receipt.folder_id !== command.folder_id || !id.test(receipt.file_id) || receipt.name !== command.name ||
      !Number.isSafeInteger(receipt.bytes) || receipt.bytes < 0 || (receipt.parent_id !== undefined && !id.test(receipt.parent_id))) {
    throw failure("drive_receipt_invalid", "El resultado de Drive no corresponde a esta operación.", 502);
  }
  if (command.action === "create_folder") {
    if (receipt.mime !== "application/vnd.google-apps.folder" || receipt.bytes !== 0 || receipt.sha256 !== undefined ||
        receipt.previous_file_id !== undefined || receipt.previous_version !== undefined ||
        (command.folder_id === "root" ? !receipt.parent_id : receipt.parent_id !== undefined && receipt.parent_id !== command.folder_id)) throw failure("drive_receipt_invalid", "Drive no confirmó la carpeta creada.", 502);
  } else {
    const bytes = Buffer.from(command.content_base64 || "", "base64");
    if (receipt.mime !== command.mime || receipt.bytes !== (command.expected_bytes ?? bytes.length) || receipt.sha256 !== command.sha256 ||
        (receipt.parent_id !== undefined && receipt.parent_id !== command.folder_id) ||
        (command.action === "save_version" ? receipt.previous_file_id !== command.file_id || receipt.previous_version !== command.expected_version || receipt.file_id === command.file_id : receipt.previous_file_id !== undefined || receipt.previous_version !== undefined)) throw failure("drive_receipt_invalid", "Drive no confirmó la copia exacta del documento.", 502);
  }
  return receipt;
}

/** Null means no Altazor account exists. An existing but invalid account never falls back to another provider account. */
export async function resolveAltazorDriveAccount(user: CausaAccessUser, options: DriveManagementOptions = {}): Promise<ManagedDriveAccount | null> {
  const db = options.client || prisma;
  const workspace = await db.altazorComputerWorkspace.findUnique({ where: { ownerId_scopeKey: { ownerId: user.id, scopeKey: "personal" } } });
  if (!workspace) return null;
  const stored = await db.personalConnectorAccount.findUnique({ where: { ownerId_provider: { ownerId: user.id, provider: `altazor-desktop:${workspace.id}:google` } }, select: { id: true } });
  if (!stored) return null;
  const binding = await resolveGoogleDriveAccountBinding(user, workspace.id, db);
  if (!workspace.enabled || !workspace.credentialEnc || workspace.causaId !== null || workspace.scopeKey !== "personal") throw failure("drive_account_unavailable", "Conecta tu cuenta de Google desde las aplicaciones de Altazor.");
  const credential = unseal<{ token: string }>(workspace.credentialEnc, `altazor:computer:${user.id}:${workspace.id}:personal`);
  const endpoint = endpointFor(workspace.endpoint), fetcher = options.fetcher || fetch;
  if (!credential.token || credential.token.length > 16000 || /[\r\n]/.test(credential.token)) throw failure("drive_account_unavailable", "Revisa la conexión del escritorio de Altazor.");
  async function localGuard(client: Db = db) {
    const currentWorkspace = await client.altazorComputerWorkspace.findUnique({ where: { id: workspace!.id } });
    if (!currentWorkspace || currentWorkspace.ownerId !== user.id || currentWorkspace.endpoint !== workspace!.endpoint || currentWorkspace.credentialEnc !== workspace!.credentialEnc || currentWorkspace.providerName !== workspace!.providerName || !currentWorkspace.enabled) throw failure("drive_account_changed", "La cuenta o el escritorio cambió. Abre de nuevo Drive.");
    const current = await resolveGoogleDriveAccountBinding(user, workspace!.id, client);
    if (current.accountId !== binding.accountId || current.revision !== binding.revision || current.connectionName !== binding.connectionName) throw failure("drive_account_changed", "La cuenta de Google cambió. Abre de nuevo Drive.");
  }
  async function rpc(path: string, body?: unknown, max = 64 * 1024): Promise<Record<string, unknown>> {
    let response: Response;
    try { response = await fetcher(endpoint + path, { method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${credential.token}`, ...(body ? { "Content-Type": "application/json" } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}), redirect: "error", cache: "no-store", signal: AbortSignal.timeout(body ? 60_000 : 12_000) }); }
    catch { throw failure("drive_outcome_unknown", "No se confirmó la respuesta de Drive. La operación no se repetirá automáticamente.", 503); }
    if (!response.ok) { await response.body?.cancel(); throw failure("drive_bridge_unavailable", "Drive no pudo completar la operación. Revisa la cuenta y sus permisos.", [403, 404, 409, 413].includes(response.status) ? response.status : 502); }
    const reader = response.body?.getReader(); if (!reader) throw failure("drive_bridge_invalid", "El escritorio no devolvió una respuesta verificable.", 502);
    const chunks: Uint8Array[] = []; let length = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break; length += part.value.length; if (length > max) { await reader.cancel(); throw failure("drive_bridge_limit", "La respuesta de Drive supera el límite permitido.", 502); } chunks.push(part.value); } } finally { reader.releaseLock(); }
    try { const data: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8")); if (!data || typeof data !== "object" || Array.isArray(data)) throw Error(); return data as Record<string, unknown>; }
    catch { throw failure("drive_bridge_invalid", "El escritorio no devolvió una respuesta verificable.", 502); }
  }
  const health = await rpc("/v1/health");
  if (health.ok !== true || health.lexopen_drive_management !== "v1") throw failure("drive_management_required", "Actualiza el escritorio de Altazor para usar Drive con tus causas.");
  const base = `/v1/lexopen/drive/${encodeURIComponent(binding.connectionName)}`;
  async function nativeStatus() {
    const status = await rpc(base + "/status");
    const scopes = binding.scopes, manage = scopes.length === 1 && scopes[0] === "https://www.googleapis.com/auth/drive";
    const read = manage || scopes.includes("https://www.googleapis.com/auth/drive.readonly");
    if (status.alias !== binding.connectionName || typeof status.account_subject_hash !== "string" || !hex.test(status.account_subject_hash) || status.account_subject_hash !== binding.subjectHash || typeof status.account_revision !== "string" || !hex.test(status.account_revision) ||
        status.can_read_files !== read || status.can_manage_files !== manage || status.access !== (manage ? "manage" : read ? "read" : "metadata") ||
        !Array.isArray(status.scopes) || JSON.stringify([...status.scopes].sort()) !== JSON.stringify([...binding.scopes].sort())) throw failure("drive_account_mismatch", "El escritorio no confirmó la misma autorización de Google.");
    return { revision: status.account_revision, read, manage };
  }
  const native = await nativeStatus(); await localGuard();
  const assertNative = async () => { await localGuard(); if ((await nativeStatus()).revision !== native.revision) throw failure("drive_account_changed", "La autorización de Google cambió. Abre de nuevo Drive."); };
  const account: ManagedDriveAccount = {
    ownerId: user.id, workspaceId: workspace.id, connectionId: binding.accountId, bindingRevision: native.revision, proofRevision: binding.revision,
    canRead: native.read, canManage: native.manage, assertActive: localGuard,
    async openTransport() {
      if (!native.read) throw failure("drive_read_required", "Autoriza la lectura de archivos en la conexión de Google de Altazor.");
      return { close() {}, async get(path, max) {
        if (!Number.isSafeInteger(max) || max < 1 || max > 25 * 1024 * 1024) throw failure("drive_read_limit", "Límite de lectura inválido.", 400);
        const url = new URL("https://www.googleapis.com/drive/v3/files" + path), query: Record<string, string> = {};
        if (url.origin !== "https://www.googleapis.com" || !/^\/drive\/v3\/files(?:\/[A-Za-z0-9_-]{10,200}(?:\/export)?)?$/.test(url.pathname)) throw failure("drive_read_path", "Consulta de Drive inválida.", 400);
        for (const [key, value] of url.searchParams) if (!["supportsAllDrives", "includeItemsFromAllDrives"].includes(key)) query[key] = value;
        await assertNative();
        const result = await rpc(base + "/read", { path: url.pathname, query, max_bytes: max, bindingRevision: native.revision }, Math.ceil(max / 3) * 4 + 16 * 1024);
        if (result.status !== 200 || typeof result.mime !== "string" || typeof result.body_base64 !== "string" || result.body_base64.length > Math.ceil(max / 3) * 4 || typeof result.sha256 !== "string" || !hex.test(result.sha256)) throw failure("drive_read_invalid", "Drive no devolvió una lectura verificable.", 502);
        const bytes = Buffer.from(result.body_base64, "base64");
        if (bytes.toString("base64") !== result.body_base64 || bytes.length !== result.bytes || bytes.length > max || hash(bytes) !== result.sha256) throw failure("drive_read_invalid", "La lectura de Drive no coincide con su comprobación.", 502);
        await assertNative(); return bytes;
      } };
    },
    async command(input, beforeWrite) {
      if (!native.manage || input.bindingRevision !== native.revision) throw failure("drive_manage_required", "Autoriza la gestión de archivos de Drive antes de continuar.", 403);
      await assertNative();
      if (beforeWrite) { try { await beforeWrite(); } catch { throw failure("drive_prewrite_denied", "La causa, la carpeta o el documento cambió antes del envío. Revisa la acción."); } }
      const result = await rpc(base + "/commands", input);
      if (result.state !== "drive_verified" || result.request_id !== input.request_id) throw failure("drive_receipt_invalid", "Drive no confirmó el resultado de esta operación.", 502);
      const receipt = verifyDriveWriteReceipt(result.receipt, input, binding.connectionName); await assertNative(); return receipt;
    },
    async reconcile(requestId, expected) {
      await assertNative(); const result = await rpc(base + "/commands/" + encodeURIComponent(requestId));
      if (result.state === "drive_verified") { const receipt = verifyDriveWriteReceipt(result.receipt, expected, binding.connectionName); await assertNative(); return receipt; }
      if (result.state === "failed") {
        if (result.request_id !== expected.request_id || result.context_key !== expected.context_key || result.account_revision !== expected.bindingRevision || result.alias !== binding.connectionName) throw failure("drive_receipt_invalid", "No se pudo comprobar a qué operación corresponde el resultado.", 502);
        await assertNative(); return { state: "failed" };
      }
      if (!["unknown", "not_found"].includes(String(result.state))) return null;
      try {
        const reconciled = await rpc(base + "/commands/" + encodeURIComponent(requestId) + "/reconcile", { context_key: expected.context_key, bindingRevision: expected.bindingRevision, confirmed: true });
        if (reconciled.state !== "drive_verified") return null;
        const receipt = verifyDriveWriteReceipt(reconciled.receipt, expected, binding.connectionName); await assertNative(); return receipt;
      } catch { return null; }
    },
  };
  return account;
}
