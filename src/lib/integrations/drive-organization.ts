import { resolveStudyDriveAccount, STUDY_ORGANIZATION_KEY } from "./google-study-drive";
import type { Prisma } from "@prisma/client";
/** A per-professional organization root, bound to the existing Google account. No new OAuth. */
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { httpError, requireSiteMutationAccess } from "@/lib/auth/access";
import { isAdmin, isStaff } from "@/lib/auth/rbac";
import { assertCausaCapability, type CausaAccessUser } from "@/lib/auth/causa-access";
import { canonicalJson } from "@/lib/command-execution";
import { digest } from "@/lib/personal-connectors/core";
import { writeAuditStrict } from "@/lib/audit";
import { type ManagedDriveAccount, type DriveWriteCommand } from "@/lib/altazor/connectors/drive-management";
import { inspectChosenDriveFolder, listDriveFoldersWithSession } from "./drive-import";
import { parseGoogleDriveFolderRef, driveFolderUrl } from "./drive-folder";
import { caseDriveRevision, linkAltazorDriveFolder, readAltazorDriveFolderBinding, assertAltazorDriveFolderBinding } from "./case-drive";
const hex = z.string().regex(/^[a-f0-9]{64}$/);
export const organizationDriveSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("root"), folderRef: z.string().min(10).max(2000), connectionId: z.string().min(1).max(160), bindingRevision: hex, revision: z.string().max(40), confirmed: z.literal(true) }).strict(),
  z.object({ action: z.literal("organize"), kind: z.enum(["causa", "site", "user"]), id: z.string().min(1).max(160), revision: z.string().min(1).max(40), confirmed: z.literal(true) }).strict(),
]);
type Db = typeof prisma | Prisma.TransactionClient;
type Root = { folderId: string; name: string; connectionId: string; bindingRevision: string; revision: string };
type Options = { client?: typeof prisma; account?: ManagedDriveAccount; signal?: AbortSignal; authorizeContext?: () => Promise<void> };
const rootKey = () => STUDY_ORGANIZATION_KEY;
async function staff(user: CausaAccessUser, db: Db) {
  const actor = await db.user.findUniqueOrThrow({ where: { id: user.id } });
  if (!isStaff(actor.role)) throw httpError("Se requiere una cuenta del equipo", 403);
  return actor;
}
async function accountFor(user: CausaAccessUser, options: Options) {
  const account = options.account || await resolveStudyDriveAccount(user, options.client);
  if (!account || account.ownerId !== user.id) throw httpError("Conecta tu cuenta de Google para continuar", 409);
  await account.assertActive();
  return account;
}
async function rootFor(db: Db): Promise<Root | null> {
  const record = await db.commandExecution.findUnique({ where: { key: rootKey() } });
  if (!record || !record.resultJson) return null;
  const schema = z.object({ folderId: z.string().regex(/^[A-Za-z0-9_-]{10,200}$/), name: z.string(), connectionId: z.string(), bindingRevision: hex, revision: z.string().uuid() });
  try { return schema.parse(JSON.parse(record.resultJson)); } catch { throw httpError("Revisa la carpeta de Organización", 409); }
}
export async function organizationDriveState(user: CausaAccessUser, options: Options = {}, browse?: { parentId?: string; query?: string; pageToken?: string }) {
  const db = options.client || prisma; const current = await staff(user, db);
  const account = await accountFor(user, options), saved = await rootFor(db);
  const valid = saved?.connectionId === account.connectionId && saved.bindingRevision === account.bindingRevision;
  const root = valid ? saved : null;
  if (browse && !isAdmin(current)) throw httpError("Sólo la administración puede explorar la cuenta compartida para elegir la Organización", 403);
  const folders = browse ? await listDriveFoldersWithSession(null, browse, { openTransport: account.openTransport }) : undefined;
  const fresh = await staff(user, db); await account.assertActive();
  if (browse && !isAdmin(fresh)) throw httpError("La autorización para explorar la cuenta compartida cambió", 403);
  return { canConfigureRoot: isAdmin(fresh), userId: user.id, connectionId: account.connectionId, bindingRevision: account.bindingRevision, canManage: account.canManage, revision: saved?.revision || "", root: root ? { id: root.folderId, name: root.name, url: driveFolderUrl(root.folderId) } : null, ...(folders ? { listing: folders } : {}) };
}
async function target(kind: "causa" | "site" | "user", id: string, user: CausaAccessUser, db: Db) {
  const actor = await staff(user, db);
  if (kind === "user") {
    if (id !== user.id) throw httpError("Sólo puedes preparar tu propia carpeta de usuario", 403);
    return { kind: "user" as const, id: actor.id, name: actor.name, clientId: null, clientName: "", folderId: null, caseRevision: null };
  }
  const cause = async (causaId: string) => {
    await assertCausaCapability(causaId, actor, "causa.write", db);
    const row = await db.causa.findUniqueOrThrow({ where: { id: causaId }, include: { cliente: true } });
    return { kind: "causa" as const, id: row.id, name: [row.rit, row.titulo].filter(Boolean).join(" — "), clientId: row.clienteId, clientName: row.cliente?.razonSocial || "Sin cliente", folderId: row.googleDriveFolderId, caseRevision: await caseDriveRevision(row.id, db) };
  };
  if (kind === "causa") return cause(id);
  await requireSiteMutationAccess(id, actor, db);
  const site = await db.site.findUniqueOrThrow({ where: { id }, include: { cliente: true } });
  if (site.causaId) return cause(site.causaId);
  return { kind: "site" as const, id: site.id, name: site.name, clientId: site.clienteId, clientName: site.cliente?.razonSocial || "Sin cliente", folderId: null, caseRevision: null };
}
export function organizedDriveName(name: string, id?: string) {
  const safe = name.normalize("NFC").replace(/[\/\\\p{Cc}\p{Cf}]/gu, " ").replace(/^\.+/, "").replace(/\s+/g, " ").trim() || "Carpeta";
  let bounded = "";
  for (const char of safe) { if (Buffer.byteLength(bounded + char) > 140) break; bounded += char; }
  return bounded + (id ? ` · ${digest(id).slice(0, 10)}` : "");
}
export async function configureOrganizationDrive(user: CausaAccessUser, raw: z.infer<typeof organizationDriveSchema>, options: Options = {}) {
  const input = organizationDriveSchema.parse(raw), db = options.client || prisma;
  options.signal?.throwIfAborted(); await options.authorizeContext?.();
  await staff(user, db);
  const account = await accountFor(user, options);
  if (!account.canManage) throw httpError("Permite gestionar archivos en tu conexión de Google", 403);
  if (input.action === "root") {
    if (!isAdmin(await staff(user, db))) throw httpError("Sólo la administración puede elegir la Organización compartida", 403);
    if (input.connectionId !== account.connectionId || input.bindingRevision !== account.bindingRevision) throw httpError("La cuenta cambió. Abre de nuevo el selector", 409);
    const reference = parseGoogleDriveFolderRef(input.folderRef);
    if (!reference || reference.folderId === "root") throw httpError("Elige una carpeta de Organización dentro de Drive", 400);
    const folder = await inspectChosenDriveFolder(reference.folderId, null, { openTransport: account.openTransport });
    const prior = await rootFor(db);
    if (prior?.folderId === folder.id && prior.connectionId === account.connectionId && prior.bindingRevision === account.bindingRevision && prior.revision === input.revision) return { state: "completed", message: "Esta Organización ya está seleccionada.", folder: { ...folder, url: driveFolderUrl(folder.id) } };
    const root: Root = { folderId: folder.id, name: folder.name, connectionId: account.connectionId, bindingRevision: account.bindingRevision, revision: randomUUID() };
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM "IntegrationConfig" WHERE provider = 'google' FOR UPDATE`;
      options.signal?.throwIfAborted(); await options.authorizeContext?.();
      if (!isAdmin(await staff(user, tx))) throw httpError("Sólo la administración puede cambiar la Organización", 403); await account.assertActive(tx);
      if ((await rootFor(tx))?.revision !== (input.revision || undefined)) throw httpError("La Organización cambió. Vuelve a cargarla", 409);
      await tx.commandExecution.upsert({ where: { key: rootKey() }, create: { key: rootKey(), ownerId: user.id, inputHash: digest(canonicalJson(root)), status: "completed", resultJson: canonicalJson(root) }, update: { ownerId: user.id, inputHash: digest(canonicalJson(root)), resultJson: canonicalJson(root), status: "completed" } });
      await writeAuditStrict({ actorId: user.id, action: "drive.organization.root", entityType: "User", entityId: user.id, after: { folderId: folder.id, connectionId: account.connectionId } }, tx);
    });
    return { state: "completed", message: "Organización seleccionada. No se movieron archivos existentes.", folder: { ...folder, url: driveFolderUrl(folder.id) } };
  }
  const root = await rootFor(db);
  if (!root || root.revision !== input.revision || root.connectionId !== account.connectionId || root.bindingRevision !== account.bindingRevision) throw httpError("Selecciona de nuevo la Organización de esta cuenta", 409);
  const scope = await target(input.kind, input.id, user, db), fingerprint = canonicalJson(scope);
  const lineage: { id: string; parent: string }[] = [];
  const guard = async () => {
    options.signal?.throwIfAborted(); await options.authorizeContext?.();
    await account.assertActive();
    if (canonicalJson(await rootFor(db)) !== canonicalJson(root) || canonicalJson(await target(input.kind, input.id, user, db)) !== fingerprint) throw httpError("El destino, el cliente o los permisos cambiaron. Revisa la Organización", 409);
    await inspectChosenDriveFolder(root.folderId, null, { openTransport: account.openTransport });
    for (const node of lineage) {
      const folder = await inspectChosenDriveFolder(node.id, null, { openTransport: account.openTransport });
      if (!folder.parents.includes(node.parent)) throw httpError("Una carpeta fue movida en Drive. Revisa la estructura antes de continuar", 409);
    }
  };
  await inspectChosenDriveFolder(root.folderId, null, { openTransport: account.openTransport });
  if (scope.kind === "causa" && scope.folderId) {
    const binding = await readAltazorDriveFolderBinding(scope.id, db);
    if (!binding) throw httpError("La causa ya tiene una carpeta anterior. Se conserva; revisa su conexión antes de cambiarla", 409);
    await assertAltazorDriveFolderBinding(scope.id, user, binding, account, db);
    const existing = await inspectChosenDriveFolder(scope.folderId, null, { openTransport: account.openTransport });
    return { state: "completed", message: "Se conserva la carpeta vinculada a esta causa. No se creó ni movió otra carpeta.", folder: { ...existing, url: driveFolderUrl(existing.id) } };
  }
  const namespace = digest(canonicalJson({ owner: user.id, root, clientId: scope.clientId || `unassigned:${user.id}` }));
  let parent = root.folderId;
  const steps = scope.kind === "user" ? [{ id: "users", name: "Usuarios" }, { id: `user:${user.id}`, name: organizedDriveName(scope.name, user.id) }] : [ { id: "clientes", name: "Clientes" }, { id: `client:${scope.clientId || user.id}`, name: organizedDriveName(scope.clientName, scope.clientId || user.id) }, { id: `group:${scope.kind}`, name: scope.kind === "causa" ? "Causas" : "Espacios de trabajo" }, { id: `${scope.kind}:${scope.id}`, name: organizedDriveName(scope.name, scope.id) } ];
  for (const step of steps) {
    await guard();
    const key = `drive-organization-node:${digest(canonicalJson({ root: root.folderId, parent, step: step.id }))}`;
    let record = await db.commandExecution.findUnique({ where: { key } });
    if (record?.status === "completed" && record.resultJson) { const savedId = JSON.parse(record.resultJson).folderId;
      const existing = await inspectChosenDriveFolder(savedId, null, { openTransport: account.openTransport });
      if (!existing.parents.includes(parent)) throw httpError("Una carpeta fue movida en Drive. Revisa la estructura antes de continuar", 409);
      lineage.push({ id: savedId, parent }); parent = savedId; continue; }
    if (record && record.ownerId !== user.id) throw httpError("Otro profesional debe confirmar la creación pendiente de esta carpeta antes de continuar", 409);
    let command: DriveWriteCommand;
    let fresh = false;
    if (record?.status === "failed") {
      const prior = JSON.parse(record.resultJson!);
      command = { ...prior.command, request_id: digest(key + randomUUID()) };
      const claimed = await db.commandExecution.updateMany({ where: { id: record.id, ownerId: user.id, status: "failed" }, data: { status: "running", inputHash: digest(canonicalJson(command)), resultJson: canonicalJson({ command, priorRequestId: prior.command.request_id }) } });
      if (!claimed.count) throw httpError("Otro proceso está comprobando esta carpeta", 409);
      fresh = true;
    } else if (!record) {
      command = { request_id: digest(key), context_key: digest(namespace + key), bindingRevision: account.bindingRevision, action: "create_folder", folder_id: parent, name: step.name, confirmed: true };
      try { record = await db.commandExecution.create({ data: { key, ownerId: user.id, status: "running", inputHash: digest(canonicalJson(command)), resultJson: canonicalJson({ command }) } }); fresh = true; }
      catch (error) { if ((error as { code?: string }).code === "P2002") throw httpError("Otro proceso está preparando esta carpeta. Comprueba el resultado", 409); throw error; }
    } else command = JSON.parse(record.resultJson!).command;
    try {
      await guard();
      const receipt = fresh ? await account.command(command!, guard) : await account.reconcile(command!.request_id, command!);
      if (!receipt) return { state: "unknown", message: "Hay un paso pendiente de confirmación. Pulsa de nuevo para comprobarlo; no se repetirá la creación." };
      if (receipt.state === "failed") { await db.commandExecution.update({ where: { id: record!.id }, data: { status: "failed" } }); throw httpError("Drive rechazó la creación. Revisa la conexión", 409); }
      await guard();
      await db.commandExecution.update({ where: { id: record!.id }, data: { status: "completed", resultJson: canonicalJson({ command: command!, folderId: receipt.file_id }) } });
      lineage.push({ id: receipt.file_id, parent }); parent = receipt.file_id;
    } catch (error) {
      if ((error as { code?: string }).code === "drive_prewrite_denied") await db.commandExecution.update({ where: { id: record!.id }, data: { status: "failed" } });
      throw error;
    }
  }
  await guard();
  if (scope.kind === "causa") await linkAltazorDriveFolder(scope.id, user, { folderRef: parent, connectionId: account.connectionId, bindingRevision: account.bindingRevision, caseRevision: scope.caseRevision! }, { client: db, account });
  await writeAuditStrict({ actorId: user.id, action: "drive.organization.prepare", entityType: scope.kind === "causa" ? "Causa" : scope.kind === "site" ? "Site" : "User", entityId: scope.id, after: { rootId: root.folderId, folderId: parent, connectionId: account.connectionId } }, db);
  return { state: "completed", message: scope.kind === "user" ? "Tu carpeta está preparada en Organización → Usuarios. No se copiaron documentos automáticamente." : "Carpeta preparada en Organización → Clientes → Cliente. No se copiaron documentos automáticamente.", folder: { id: parent, name: steps.at(-1)!.name, url: driveFolderUrl(parent) } };
}
