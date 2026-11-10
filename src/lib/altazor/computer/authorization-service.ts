import { computerSessionExpired, activeComputerSessionWhere } from "./lifecycle";
import { prisma } from "@/lib/db";
import type { AltazorComputerWorkspace, AltazorComputerSession, Prisma, PrismaClient } from "@prisma/client";
import { altazorActor, altazorScopeKey } from "../access";
import { assertCausaAccess, type CausaAccessUser } from "@/lib/auth/causa-access";
import { ConnectorError } from "@/lib/personal-connectors/core";
import { mustEnrollTwoFactor } from "@/lib/auth/two-factor-policy";
import { computerOperationHash } from "./operation-hash";
import { computerAuthorizationBroker as broker } from "./service";
import { DEFAULT_COMPUTER_AUTHORIZATION, parseComputerAuthorizationChoice, type ComputerAuthorizationAck, type ComputerAuthorizationChoice } from "./authorization-policy";
import type { ComputerAuthorizationSettings, ComputerAuthorizationView } from "./types";
import type { KittiesGateway } from "./gateway";

type DB = PrismaClient | Prisma.TransactionClient;
type Saved = { version: 1; ownerId: string; workspaceId: string; scopeKey: string; revision: number; choice: ComputerAuthorizationChoice; operationId: string; signature: string };
type SessionAck = { version: 1; ownerId: string; workspaceId: string; sessionId: string; chatId: string; kittyId: string; desiredRevision: number; ack: ComputerAuthorizationAck; signature: string };
const key = (workspace: AltazorComputerWorkspace) => `altazor-computer-policy:${workspace.id}`;
const fields = (choice: ComputerAuthorizationSettings): ComputerAuthorizationSettings => ({ mode: choice.mode, allowInput: choice.allowInput, allowBrowser: choice.allowBrowser, allowApps: choice.allowApps, maxActions: choice.maxActions, maxConsultations: choice.maxConsultations });
const same = (a: ComputerAuthorizationSettings, b: ComputerAuthorizationSettings) => JSON.stringify(fields(a)) === JSON.stringify(fields(b));
export const computerAuthorizationBinding = (workspace: AltazorComputerWorkspace) => computerOperationHash(workspace.ownerId, workspace.id, "authorization-binding", { scopeKey: workspace.scopeKey });
const sign = (workspace: AltazorComputerWorkspace, value: Omit<Saved, "signature">) => computerOperationHash(workspace.ownerId, workspace.id, "authorization-record", value);
const ackKey = (session: AltazorComputerSession) => `altazor-computer-policy-ack:${session.id}`;
async function saveAck(workspace: AltazorComputerWorkspace, session: AltazorComputerSession, value: Saved, ack: ComputerAuthorizationAck, tx: Prisma.TransactionClient) {
  const body: Omit<SessionAck, "signature"> = { version: 1, ownerId: workspace.ownerId, workspaceId: workspace.id, sessionId: session.id, chatId: ack.chatId, kittyId: ack.kittyId, desiredRevision: value.revision, ack };
  const configJson = JSON.stringify({ ...body, signature: computerOperationHash(workspace.ownerId, session.id, "authorization-ack", body) });
  await tx.integrationConfig.upsert({ where: { provider: ackKey(session) }, create: { provider: ackKey(session), enabled: true, configJson }, update: { enabled: true, configJson } });
}
async function sessionAck(workspace: AltazorComputerWorkspace, session: AltazorComputerSession, db: DB = prisma): Promise<SessionAck | null> {
  const row = await db.integrationConfig.findUnique({ where: { provider: ackKey(session) } });
  if (!row) return null;
  try {
    const value = JSON.parse(row.configJson) as SessionAck, { signature, ...body } = value;
    if (!row.enabled || value.version !== 1 || value.ownerId !== workspace.ownerId || value.workspaceId !== workspace.id || value.sessionId !== session.id || value.chatId !== session.chatId || value.kittyId !== session.kittyId || value.ack.applied !== true || value.ack.binding !== computerAuthorizationBinding(workspace) || computerOperationHash(workspace.ownerId, session.id, "authorization-ack", body) !== signature) throw new Error();
    return value;
  } catch { return null; }
}

async function saved(workspace: AltazorComputerWorkspace, db: DB = prisma): Promise<Saved | null> {
  const row = await db.integrationConfig.findUnique({ where: { provider: key(workspace) } });
  if (!row) return null;
  try {
    const value = JSON.parse(row.configJson) as Saved;
    const { signature, ...body } = value;
    parseComputerAuthorizationChoice(value.choice);
    if (!row.enabled || value.version !== 1 || value.ownerId !== workspace.ownerId || value.workspaceId !== workspace.id || value.scopeKey !== workspace.scopeKey || !Number.isSafeInteger(value.revision) || value.revision < 1 || value.choice.expectedRevision + 1 !== value.revision || typeof value.operationId !== "string" || !value.operationId || sign(workspace, body) !== signature) throw new Error();
    return value;
  } catch { throw new ConnectorError("computer_policy_record", "La configuración guardada requiere revisión. No se ampliaron las autorizaciones.", 409); }
}
async function operation(value: Saved | null, db: DB = prisma) {
  return value ? db.altazorConnectorOperation.findFirst({ where: { id: value.operationId, ownerId: value.ownerId, workspaceId: value.workspaceId, kind: "computer_policy" }, select: { status: true } }) : null;
}
export async function assertComputerAuthorizationActor(user: CausaAccessUser, db: DB = prisma) {
  const actor = await altazorActor(user, db), row = await db.user.findUniqueOrThrow({ where: { id: actor.id }, select: { totpEnabled: true } });
  const policy = await db.firmSettings.findFirst({ select: { require2faPrivileged: true } });
  if (mustEnrollTwoFactor({ role: actor.role, totpEnabled: row.totpEnabled, policyEnabled: policy?.require2faPrivileged ?? true })) throw new ConnectorError("2fa_required", "Activa la verificación en dos pasos de tu cuenta antes de cambiar autorizaciones.", 403);
  return { actor, totpEnabled: row.totpEnabled };
}
async function lockActor(user: CausaAccessUser, tx: Prisma.TransactionClient) {
  const { actor, totpEnabled } = await assertComputerAuthorizationActor(user, tx);
  const changed = await tx.user.updateMany({ where: { id: actor.id, role: actor.role, sessionVersion: actor.sessionVersion, capabilityGrants: actor.capabilityGrants, capabilityRevokes: actor.capabilityRevokes, totpEnabled }, data: { capabilityRevokes: actor.capabilityRevokes } });
  if (!changed.count) throw new ConnectorError("actor_changed", "Tus permisos cambiaron. Actualiza la configuración.", 409);
}
async function activeSession(workspace: AltazorComputerWorkspace, db: DB = prisma) {
  const rows = await db.altazorComputerSession.findMany({ where: { workspaceId: workspace.id, ownerId: workspace.ownerId, state: { in: ["creating", "starting", "ready", "unknown"] } }, orderBy: { createdAt: "desc" }, take: 2 });
  if (rows.length > 1) throw new ConnectorError("computer_policy_sessions", "Detén los escritorios anteriores antes de cambiar sus autorizaciones.", 409);
  return rows[0] ?? null;
}
async function writableSession(session: AltazorComputerSession | null, client: KittiesGateway, binding: string, db: DB = prisma) {
  if (!session) return null;
  if (session.state !== "ready" || !session.chatId || !session.kittyId || computerSessionExpired(session)) throw new ConnectorError("computer_policy_session", "Espera a que abra el escritorio o detén el anterior antes de cambiar autorizaciones.", 409);
  if (session.held && Date.now() - session.updatedAt.getTime() < 5 * 60_000) throw new ConnectorError("manual_control", "Devuelve el control al asistente antes de cambiar autorizaciones.", 409);
  if (await db.altazorComputerAction.count({ where: { sessionId: session.id, ownerId: session.ownerId, kind: { in: ["message", "computer_use_approval"] }, status: { in: ["sending", "unknown"] } } })) throw new ConnectorError("task_unconfirmed", "Hay una tarea en curso o sin confirmar. Compruébala o detén el escritorio antes de cambiar autorizaciones.", 409);
  const chat = await client.chat(session.chatId, session.kittyId);
  if (chat.working) throw new ConnectorError("task_busy", "Termina o cancela la tarea actual antes de cambiar autorizaciones.", 409);
  const current = await client.computerAuthorization(session.chatId, session.kittyId, binding);
  if (current.outcomeUnknown) throw new ConnectorError("computer_outcome_unknown", "Una acción del computador quedó sin confirmar. Revisa el monitor, detén este escritorio y abre uno nuevo; no se repetirá la acción ni se cambiarán sus permisos.", 409);
  if (current.applied && (await client.pendingComputerApprovals(session.kittyId, session.chatId, binding, current.revision)).length) throw new ConnectorError("computer_policy_consultation", "Resuelve o rechaza la consulta pendiente antes de cambiar autorizaciones.", 409);
  return current;
}

export async function listComputerAuthorizationWorkspaces(user: CausaAccessUser) {
  const actor = await altazorActor(user);
  const rows = await prisma.altazorComputerWorkspace.findMany({ where: { ownerId: actor.id, enabled: true, credentialEnc: { not: null } }, include: { causa: { select: { titulo: true } } }, orderBy: { updatedAt: "desc" }, take: 50 });
  const values: { id: string; label: string; causaId: string | null }[] = [];
  for (const row of rows) {
    if (row.scopeKey !== altazorScopeKey(row.causaId)) continue;
    try { if (row.causaId) await assertCausaAccess(row.causaId, actor); } catch { continue; }
    values.push({ id: row.id, label: row.causaId ? row.causa?.titulo || "Espacio de causa" : "Mi espacio personal", causaId: row.causaId });
  }
  return values;
}
export async function readAuthorizationForSession(user: CausaAccessUser, workspace: AltazorComputerWorkspace, session: AltazorComputerSession | null, client: KittiesGateway, local = false): Promise<ComputerAuthorizationView> {
  let value: Saved | null;
  try { value = await saved(workspace); }
  catch { return { workspaceId: workspace.id, revision: 0, desired: fields(DEFAULT_COMPUTER_AUTHORIZATION), applied: null, sessionId: session?.id ?? null, state: "unknown", canConfigure: false, reason: "La configuración guardada necesita revisión. El monitor y el control manual siguen disponibles; no se conceden permisos nuevos." }; }
  const prior = await operation(value);
  let editable = local, reason = local ? undefined : "Cambia las autorizaciones desde la aplicación del equipo principal del estudio.";
  try { await assertComputerAuthorizationActor(user); await broker.policyAllowsAction(); } catch (error) { editable = false; if (local) reason = (error as { code?: string }).code === "2fa_required" ? "Activa la verificación en dos pasos en Mi cuenta antes de cambiar autorizaciones." : "La política actual del estudio no permite cambiar las autorizaciones del escritorio. Revísala con la administración."; }
  const base: ComputerAuthorizationView = { workspaceId: workspace.id, revision: value?.revision ?? 0, desired: fields(value?.choice ?? DEFAULT_COMPUTER_AUTHORIZATION), applied: null, sessionId: session?.id ?? null, state: value ? "saved" : "default", canConfigure: editable, ...(reason ? { reason } : {}) };
  try {
    await client.requireComputerUsePolicy();
    if (session && session.chatId && session.kittyId && session.state === "ready" && !computerSessionExpired(session)) {
      const native = await client.computerAuthorization(session.chatId, session.kittyId, computerAuthorizationBinding(workspace));
      base.applied = native;
      const acknowledged = await sessionAck(workspace, session);
      base.state = !value ? native.applied ? "mismatch" : "default" : prior?.status !== "completed" ? "unknown" : native.applied && same(native, value.choice) && acknowledged?.desiredRevision === value.revision && acknowledged.ack.revision === native.revision ? "applied" : "mismatch";
      if (native.outcomeUnknown) { base.state = "unknown"; base.canConfigure = false; base.reason = "Una acción quedó sin confirmar. Revisa el monitor, detén este escritorio y abre uno nuevo. No se repetirá automáticamente ni se borrará la incertidumbre al guardar permisos."; }
    } else if (session) { base.state = "unknown"; base.reason = "El escritorio anterior necesita comprobación o cierre antes de aplicar cambios."; }
    if (!base.applied?.outcomeUnknown && value && prior?.status !== "completed") { base.state = "unknown"; base.reason = "El último cambio no quedó confirmado. No se repetirá automáticamente; comprueba el estado antes de guardar una nueva elección."; }
    return base;
  } catch (error) {
    return { ...base, state: (error as { code?: string }).code === "computer_policy_unsupported" ? "unsupported" : "unknown", canConfigure: false, reason: (error as { code?: string }).code === "computer_policy_unsupported" ? "Actualiza el escritorio para aplicar autorizaciones de uso del computador." : "No se pudieron comprobar las autorizaciones actuales. El monitor y el control manual siguen disponibles." };
  }
}
export async function readComputerAuthorization(user: CausaAccessUser, workspaceId: string, local = false) {
  const { workspace } = await broker.workspaceFor(workspaceId, user), client = await broker.readyGateway(workspace, false);
  const result = await readAuthorizationForSession(user, workspace, await activeSession(workspace), client, local);
  await broker.workspaceFor(workspaceId, user); return result;
}

export async function saveComputerAuthorization(user: CausaAccessUser, workspaceId: string, requestId: string, raw: unknown) {
  const choice = parseComputerAuthorizationChoice(raw), { actor, workspace } = await broker.workspaceFor(workspaceId, user);
  await assertComputerAuthorizationActor(actor); await broker.policyAllowsAction();
  const inputHash = computerOperationHash(actor.id, workspace.id, "computer_policy", choice);
  const previous = await prisma.altazorConnectorOperation.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId } } });
  if (previous) {
    if (previous.workspaceId !== workspaceId || previous.kind !== "computer_policy" || previous.inputHash !== inputHash) throw new ConnectorError("request_conflict", "Esta confirmación corresponde a otro cambio.", 409);
    return { status: previous.status, authorization: await readComputerAuthorization(actor, workspaceId, true) };
  }
  const client = await broker.readyGateway(workspace, false); await client.requireComputerUsePolicy();
  await writableSession(await activeSession(workspace), client, computerAuthorizationBinding(workspace));
  const claim = await prisma.$transaction(async tx => {
    await lockActor(actor, tx); await broker.lockWorkspace(workspace, actor, tx); await broker.policyAllowsAction(tx);
    const existing = await tx.altazorConnectorOperation.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId } } });
    if (existing) {
      if (existing.workspaceId !== workspaceId || existing.kind !== "computer_policy" || existing.inputHash !== inputHash) throw new ConnectorError("request_conflict", "Esta confirmación corresponde a otro cambio.", 409);
      return { row: existing, claimed: false };
    }
    const current = await saved(workspace, tx);
    if ((current?.revision ?? 0) !== choice.expectedRevision) throw new ConnectorError("computer_policy_changed", "La configuración cambió. Actualízala antes de confirmar otra elección.", 409);
    const pendingSession = await activeSession(workspace, tx);
    if (pendingSession && await tx.altazorComputerAction.count({ where: { sessionId: pendingSession.id, ownerId: actor.id, kind: { in: ["message", "computer_use_approval"] }, status: { in: ["sending", "unknown"] } } })) throw new ConnectorError("task_unconfirmed", "Hay una tarea en curso o sin confirmar. Compruébala antes de cambiar autorizaciones.", 409);
    const pending = await tx.altazorConnectorOperation.findMany({ where: { ownerId: actor.id, workspaceId, status: { in: ["sending", "unknown"] } } });
    if (pending.some(v => v.kind !== "computer_policy" || v.status === "sending" && Date.now() - v.createdAt.getTime() < 60_000)) throw new ConnectorError("computer_policy_pending", "Hay un cambio en curso. Comprueba su resultado antes de guardar.", 409);
    // A new, explicit choice supersedes uncertainty, never replays the old PUT.
    if (pending.length) await tx.altazorConnectorOperation.updateMany({ where: { id: { in: pending.map(v => v.id) } }, data: { status: "acknowledged" } });
    const op = await tx.altazorConnectorOperation.create({ data: { ownerId: actor.id, workspaceId, requestId, kind: "computer_policy", inputHash } });
    const body: Omit<Saved, "signature"> = { version: 1, ownerId: actor.id, workspaceId, scopeKey: workspace.scopeKey, revision: choice.expectedRevision + 1, choice, operationId: op.id };
    await tx.integrationConfig.upsert({ where: { provider: key(workspace) }, create: { provider: key(workspace), enabled: true, configJson: JSON.stringify({ ...body, signature: sign(workspace, body) }) }, update: { enabled: true, configJson: JSON.stringify({ ...body, signature: sign(workspace, body) }) } });
    return { row: op, claimed: true };
  }, { isolationLevel: "ReadCommitted", timeout: 20_000 });
  const row = claim.row;
  if (!claim.claimed) return { status: row.status, authorization: await readComputerAuthorization(actor, workspaceId, true) };
  try {
    await prisma.$transaction(async tx => {
      await lockActor(actor, tx); await broker.lockWorkspace(workspace, actor, tx); await broker.policyAllowsAction(tx);
      const current = await saved(workspace, tx); if (current?.operationId !== row.id) throw new ConnectorError("computer_policy_changed", "La elección cambió antes de aplicarse.", 409);
      const session = await activeSession(workspace, tx);
      if (session) {
        const locked = await tx.altazorComputerSession.updateMany({ where: { id: session.id, ownerId: actor.id, workspaceId, state: session.state, updatedAt: session.updatedAt }, data: { updatedAt: session.updatedAt } });
        if (!locked.count) throw new ConnectorError("session_changed", "El escritorio cambió antes de aplicar autorizaciones.", 409);
        const native = await writableSession(session, client, computerAuthorizationBinding(workspace), tx);
        const ack = await client.setComputerAuthorization(session.chatId!, session.kittyId!, computerAuthorizationBinding(workspace), choice, native!.revision);
        await saveAck(workspace, session, current!, ack, tx);
      }
      await broker.workspaceFor(workspaceId, actor, tx);
      await tx.altazorConnectorOperation.update({ where: { id: row.id }, data: { status: "completed" } });
    }, { isolationLevel: "ReadCommitted", timeout: 60_000 });
  } catch (error) {
    await prisma.altazorConnectorOperation.updateMany({ where: { id: row.id, status: "sending" }, data: { status: "unknown" } });
    throw error;
  }
  return { status: "completed", authorization: await readComputerAuthorization(actor, workspaceId, true) };
}

/** Called only during an explicitly requested desktop start. Unknown choices
 * are not replayed; absent choices leave the native observational default. */
export async function applySavedComputerAuthorization(user: CausaAccessUser, workspace: AltazorComputerWorkspace, sessionId: string, chatId: string, kittyId: string, client: KittiesGateway) {
  const value = await saved(workspace);
  if (!value || (await operation(value))?.status !== "completed") return;
  await prisma.$transaction(async tx => {
    await lockActor(user, tx); await broker.lockWorkspace(workspace, user, tx); await broker.policyAllowsAction(tx);
    const current = await saved(workspace, tx);
    const session = await tx.altazorComputerSession.findFirst({ where: { id: sessionId, ownerId: workspace.ownerId, workspaceId: workspace.id, kittyId, state: "starting", chatId: null, ...activeComputerSessionWhere() } });
    if (!session || !current || current.signature !== value.signature || (await operation(current, tx))?.status !== "completed") throw new ConnectorError("computer_policy_changed", "La elección cambió durante la apertura del escritorio.", 409);
    const native = await client.computerAuthorization(chatId, kittyId, computerAuthorizationBinding(workspace));
    const ack = await client.setComputerAuthorization(chatId, kittyId, computerAuthorizationBinding(workspace), current.choice, native.revision);
    await saveAck(workspace, { ...session, chatId }, current, ack, tx);
  }, { isolationLevel: "ReadCommitted", timeout: 45_000 });
}

/** Read-only native verification immediately before an outbound model/action.
 * Unknown writes are never reconciled by guessing or replaying their PUT. */
export async function assertComputerAuthorizationCurrent(user: CausaAccessUser, workspace: AltazorComputerWorkspace, session: AltazorComputerSession, client: KittiesGateway, db: DB) {
  await client.requireComputerUsePolicy();
  const value = await saved(workspace, db), native = await client.computerAuthorization(session.chatId!, session.kittyId!, computerAuthorizationBinding(workspace));
  if (native.outcomeUnknown) throw new ConnectorError("computer_outcome_unknown", "Una acción quedó sin confirmar. Revisa y cierra este escritorio antes de abrir uno nuevo. No se repetirá la acción.", 409);
  if (!value && !native.applied) return; // Observational native default, no new grants.
  const acknowledged = await sessionAck(workspace, session, db);
  if (!value || (await operation(value, db))?.status !== "completed" || !native.applied || !same(native, value.choice) || acknowledged?.desiredRevision !== value.revision || acknowledged.ack.revision !== native.revision) throw new ConnectorError("computer_policy_unconfirmed", "Las autorizaciones no coinciden con la elección confirmada. Compruébalas en Configuración antes de continuar.", 409);
  await broker.workspaceFor(workspace.id, user, db);
}
