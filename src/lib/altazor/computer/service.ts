import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { AltazorComputerAction, AltazorComputerSession, AltazorComputerWorkspace, PrismaClient, Prisma } from "@prisma/client";
import { assertCausaAccess, type CausaAccessUser } from "@/lib/auth/causa-access";
import { altazorActor, altazorScopeKey } from "@/lib/altazor/access";
import { normalizeAssistantFirmPolicy } from "@/lib/assistant/firm-policy";
import { ConnectorError, digest, encryptionKey, seal, unseal } from "@/lib/personal-connectors/core";
import { assertComputerEnabled, assertSessionLive, COMPUTER_LIMITS, computerEnabled, endpointFor, inputSchema, inspectSelectedFiles, type PersonInput } from "./policy";
import { KittiesGateway } from "./gateway";
import type { ComputerMessage, ComputerSessionSummary, ComputerSessionView, ComputerStatus } from "./types";
import { assertComputerPolicy, computerPolicyAllowed, COMPUTER_LOCAL_ONLY_REASON } from "./privacy";
import { computerOperationHash } from "./operation-hash";

type Client = PrismaClient | Prisma.TransactionClient;
const credentialContext = (row: Pick<AltazorComputerWorkspace, "id" | "ownerId" | "scopeKey">) => `altazor:computer:${row.ownerId}:${row.id}:${row.scopeKey}`;
async function computerPolicy(db: Client = prisma) { return normalizeAssistantFirmPolicy(await db.firmSettings.findFirst({ select: { assistantLlmMode: true } })).assistantLlmMode; }
async function policyAllowsAction(db: Client = prisma) { assertComputerPolicy(await computerPolicy(db)); }
function summary(row: AltazorComputerSession): ComputerSessionSummary { return { id: row.id, state: row.expiresAt.getTime() <= Date.now() ? "expired" : row.state, expiresAt: row.expiresAt.toISOString(), held: row.held && Date.now() - row.updatedAt.getTime() < 5 * 60_000, createdAt: row.createdAt.toISOString() }; }
async function scopedActor(user: CausaAccessUser, causaId?: string | null, db: Client = prisma) {
  const actor = await altazorActor(user, db);
  if (causaId) await assertCausaAccess(causaId, actor, { auditOverride: false }, db);
  return actor;
}
async function workspaceFor(id: string, user: CausaAccessUser, db: Client = prisma) {
  assertComputerEnabled();
  const actor = await altazorActor(user, db), workspace = await db.altazorComputerWorkspace.findFirst({ where: { id, ownerId: actor.id } });
  if (!workspace || workspace.scopeKey !== altazorScopeKey(workspace.causaId)) throw new ConnectorError("workspace_not_found", "Espacio no encontrado o sin acceso actual.", 404);
  if (workspace.causaId) await assertCausaAccess(workspace.causaId, actor, { auditOverride: false }, db);
  if (!workspace.enabled || !workspace.credentialEnc) throw new ConnectorError("workspace_disabled", "El gateway de este espacio no está configurado o está desactivado.", 409);
  return { actor, workspace };
}
async function unchangedWorkspace(expected: AltazorComputerWorkspace, user: CausaAccessUser, db: Client = prisma) {
  const current = await workspaceFor(expected.id, user, db);
  if (current.workspace.credentialEnc !== expected.credentialEnc || current.workspace.providerName !== expected.providerName || current.workspace.endpoint !== expected.endpoint) throw new ConnectorError("workspace_changed", "La configuración cambió. Compruebe el gateway nuevamente.", 409);
  return current;
}
async function lockWorkspace(expected: AltazorComputerWorkspace, user: CausaAccessUser, tx: Prisma.TransactionClient) {
  await unchangedWorkspace(expected, user, tx);
  const locked = await tx.altazorComputerWorkspace.updateMany({ where: { id: expected.id, ownerId: expected.ownerId, enabled: true, credentialEnc: expected.credentialEnc, providerName: expected.providerName }, data: { updatedAt: expected.updatedAt } });
  if (!locked.count) throw new ConnectorError("workspace_changed", "La configuración cambió. Compruebe el gateway nuevamente.", 409);
}
async function sessionFor(id: string, user: CausaAccessUser, cleanup = false) {
  const actor = await altazorActor(user), session = await prisma.altazorComputerSession.findFirst({ where: { id, ownerId: actor.id } });
  if (!session) throw new ConnectorError("session_not_found", "Sesión no encontrada o sin acceso actual.", 404);
  const access = await workspaceFor(session.workspaceId, actor);
  if (cleanup && session.expiresAt.getTime() > Date.now()) { /* Explicit cleanup and its receipt may close a partially created session. */ }
  else assertSessionLive(session);
  return { ...access, session };
}
function gateway(workspace: AltazorComputerWorkspace) {
  const credential = unseal<{ token: string }>(workspace.credentialEnc!, credentialContext(workspace));
  return new KittiesGateway(workspace.endpoint, credential.token);
}
async function readyGateway(workspace: AltazorComputerWorkspace) {
  const client = gateway(workspace), known = await prisma.altazorComputerSession.findMany({ where: { workspaceId: workspace.id, ownerId: workspace.ownerId }, select: { kittyName: true } });
  try {
    const ready = await client.readiness(workspace.providerName, known.map(row => row.kittyName));
    await prisma.altazorComputerWorkspace.updateMany({ where: { id: workspace.id, credentialEnc: workspace.credentialEnc, enabled: true }, data: { lastVerifiedAt: new Date(), gatewayVersion: ready.version, lastErrorCode: null } });
    return client;
  } catch (error) {
    await prisma.altazorComputerWorkspace.updateMany({ where: { id: workspace.id }, data: { lastErrorCode: error instanceof ConnectorError ? error.code : "gateway_unavailable", lastVerifiedAt: null } });
    throw error;
  }
}
export async function computerStatus(user: CausaAccessUser, causaId?: string | null, canConfigure = false): Promise<ComputerStatus> {
  const actor = await scopedActor(user, causaId);
  const workspace = await prisma.altazorComputerWorkspace.findUnique({ where: { ownerId_scopeKey: { ownerId: actor.id, scopeKey: altazorScopeKey(causaId) } } });
  const enabled = computerEnabled(), configured = Boolean(workspace?.enabled && workspace.credentialEnc);
  const policyAllowed = computerPolicyAllowed(await computerPolicy());
  const sessions = workspace ? await prisma.altazorComputerSession.findMany({ where: { ownerId: actor.id, workspaceId: workspace.id }, orderBy: { createdAt: "desc" }, take: 15 }) : [];
  return { enabled, configured, policyAllowed, canConfigure: enabled && canConfigure, state: !enabled ? "disabled" : !policyAllowed ? "error" : !configured ? "unconfigured" : workspace?.lastErrorCode ? "error" : "configured", workspaceId: workspace?.id || null, provider: workspace?.providerName || null, version: workspace?.gatewayVersion || null, lastVerifiedAt: workspace?.lastVerifiedAt?.toISOString() || null, reason: !enabled ? "El computador opcional está desactivado en este Host." : !policyAllowed ? COMPUTER_LOCAL_ONLY_REASON : !configured ? "Configure una instancia Kitties independiente para este profesional y este espacio, desde el Host local." : workspace?.lastErrorCode ? "La última comprobación no confirmó un escritorio disponible. Compruebe el gateway." : null, runtime: "container", sessions: sessions.map(summary) };
}
export async function configureComputer(user: CausaAccessUser, input: { causaId?: string | null; endpoint: string; token: string; provider: string; dedicated: true }) {
  assertComputerEnabled(); encryptionKey();
  if (input.dedicated !== true) throw new ConnectorError("dedicated_required", "Confirme una instancia independiente y exclusiva para este espacio.", 400);
  const actor = await scopedActor(user, input.causaId), endpoint = endpointFor(input.endpoint), scopeKey = altazorScopeKey(input.causaId);
  const existing = await prisma.altazorComputerWorkspace.findUnique({ where: { ownerId_scopeKey: { ownerId: actor.id, scopeKey } } });
  if (existing && existing.endpoint !== endpoint) throw new ConnectorError("gateway_reserved", "La dirección está fijada a este espacio para conservar su aislamiento. Use su gateway dedicado original.", 409);
  const taken = await prisma.altazorComputerWorkspace.findUnique({ where: { endpoint }, select: { id: true } });
  if (taken && taken.id !== existing?.id) throw new ConnectorError("gateway_reserved", "Este gateway ya pertenece a otro espacio. Configure una instancia independiente.", 409);
  const known = existing ? await prisma.altazorComputerSession.findMany({ where: { workspaceId: existing.id }, select: { kittyName: true } }) : [];
  const client = new KittiesGateway(endpoint, input.token), readiness = await client.readiness(input.provider, known.map(row => row.kittyName));
  await scopedActor(user, input.causaId);
  const id = existing?.id || randomUUID(), identity = { id, ownerId: actor.id, scopeKey };
  const data = { endpoint, credentialEnc: seal({ token: input.token }, credentialContext(identity)), providerName: input.provider, enabled: true, dedicatedDeclaredAt: new Date(), gatewayVersion: readiness.version, lastVerifiedAt: new Date(), lastErrorCode: null };
  await prisma.$transaction(async tx => {
    await scopedActor(user, input.causaId, tx);
    if (!existing) return tx.altazorComputerWorkspace.create({ data: { id, ownerId: actor.id, causaId: input.causaId || null, scopeKey, ...data } });
    // Rotation and new sessions serialize on the same row; credentials never change mid-session.
    const locked = await tx.altazorComputerWorkspace.updateMany({ where: { id: existing.id, ownerId: actor.id, credentialEnc: existing.credentialEnc }, data: { updatedAt: existing.updatedAt } });
    if (!locked.count) throw new ConnectorError("workspace_changed", "La configuración cambió. Vuelva a cargarla antes de guardar.", 409);
    if (await tx.altazorComputerSession.count({ where: { workspaceId: existing.id, state: { in: ["creating", "ready", "starting", "unknown"] }, expiresAt: { gt: new Date() } } })) throw new ConnectorError("sessions_active", "Cierre las sesiones activas antes de cambiar la autorización o proveedor.", 409);
    return tx.altazorComputerWorkspace.update({ where: { id: existing.id }, data });
  });
  return computerStatus(user, input.causaId, true);
}
export async function disableComputer(user: CausaAccessUser, workspaceId: string) {
  const { actor, workspace } = await workspaceFor(workspaceId, user);
  await prisma.$transaction(async tx => {
    await lockWorkspace(workspace, user, tx);
    const active = await tx.altazorComputerSession.count({ where: { workspaceId, ownerId: actor.id, state: { in: ["creating", "ready", "starting", "unknown"] }, expiresAt: { gt: new Date() } } });
    if (active) throw new ConnectorError("sessions_active", "Cierre las sesiones activas antes de retirar la autorización del gateway.", 409);
    await tx.altazorComputerWorkspace.update({ where: { id: workspace.id }, data: { enabled: false, credentialEnc: null, lastVerifiedAt: null } });
  });
  return computerStatus(user, workspace.causaId);
}
export async function verifyComputer(user: CausaAccessUser, workspaceId: string) {
  const { workspace } = await workspaceFor(workspaceId, user); await readyGateway(workspace); await workspaceFor(workspaceId, user);
  return computerStatus(user, workspace.causaId);
}
export async function createComputerSession(user: CausaAccessUser, workspaceId: string, requestId: string) {
  const { actor, workspace } = await workspaceFor(workspaceId, user);
  await policyAllowsAction();
  const replay = await prisma.altazorComputerSession.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId } } });
  if (replay) { if (replay.workspaceId !== workspaceId) throw new ConnectorError("request_conflict", "La operación corresponde a otro espacio.", 409); return summary(replay); }
  if (await prisma.altazorComputerSession.count({ where: { workspaceId, ownerId: actor.id, state: { in: ["creating", "ready", "starting", "unknown"] }, expiresAt: { gt: new Date() } } })) throw new ConnectorError("session_active", "Abra o cierre la sesión activa antes de crear otra.", 409);
  const client = await readyGateway(workspace), id = randomUUID(), kittyName = `altazor-${digest(id).slice(0, 22)}`;
  const row = await prisma.$transaction(async tx => {
    await lockWorkspace(workspace, user, tx); await policyAllowsAction(tx);
    if (await tx.altazorComputerSession.count({ where: { workspaceId, ownerId: actor.id, state: { in: ["creating", "ready", "starting", "unknown"] }, expiresAt: { gt: new Date() } } })) throw new ConnectorError("session_active", "Ya hay una sesión activa en este espacio.", 409);
    return tx.altazorComputerSession.create({ data: { id, ownerId: actor.id, workspaceId, requestId, kittyName, expiresAt: new Date(Date.now() + COMPUTER_LIMITS.sessionMs) } });
  });
  try {
    await unchangedWorkspace(workspace, user); await policyAllowsAction();
    const kitty = await client.createKitty(kittyName, workspace.providerName);
    await prisma.altazorComputerSession.update({ where: { id }, data: { kittyId: kitty.id, state: "starting" } });
    await unchangedWorkspace(workspace, user); await policyAllowsAction();
    const chatId = await client.createChat(kitty);
    await workspaceFor(workspaceId, user);
    const saved = await prisma.altazorComputerSession.update({ where: { id }, data: { chatId, state: kitty.status === "running" ? "ready" : "starting" } });
    return summary(saved);
  } catch (error) {
    await prisma.altazorComputerSession.update({ where: { id: row.id }, data: { state: "unknown" } });
    throw error;
  }
}
export async function readComputerSession(user: CausaAccessUser, id: string): Promise<ComputerSessionView> {
  const { workspace, session } = await sessionFor(id, user), client = await readyGateway(workspace);
  if (!session.kittyId || !session.chatId) throw new ConnectorError("session_incomplete", "El gateway no confirmó la creación completa de esta sesión.", 409);
  const kitty = await client.kitty(session.kittyId, session.kittyName, workspace.providerName), chat = await client.chat(session.chatId, session.kittyId);
  await sessionFor(id, user);
  return { session: { ...summary(session), state: kitty.status === "running" ? "ready" : ["created", "starting"].includes(kitty.status) ? "starting" : kitty.status }, runtime: "container", kittyStatus: kitty.status, ...chat };
}
function actionView(row: AltazorComputerAction) { return { id: row.id, status: row.status === "sending" && Date.now() - row.createdAt.getTime() > 60_000 ? "unknown" : row.status, result: row.status === "completed" && row.resultJson ? JSON.parse(row.resultJson) as Record<string, unknown> : null }; }
async function executeAction(user: CausaAccessUser, id: string, kind: string, requestId: string, input: unknown, run: (client: KittiesGateway, row: AltazorComputerSession) => Promise<Record<string, unknown>>, cleanup = false) {
  const access = await sessionFor(id, user, cleanup), { actor, workspace } = access;
  const needsModelPolicy = kind !== "cancel" && kind !== "close";
  if (needsModelPolicy) await policyAllowsAction();
  let session = access.session;
  const inputHash = computerOperationHash(actor.id, id, kind, input);
  const existing = await prisma.altazorComputerAction.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId } } });
  if (existing) { if (existing.sessionId !== id || existing.kind !== kind || existing.inputHash !== inputHash) throw new ConnectorError("request_conflict", "La operación corresponde a otra acción.", 409); return actionView(existing); }
  const client = await readyGateway(workspace);
  if (kind === "close" && !session.kittyId) {
    const recovered = await client.kitty(session.kittyName, session.kittyName, workspace.providerName);
    session = await prisma.altazorComputerSession.update({ where: { id: session.id }, data: { kittyId: recovered.id } });
  }
  if (!session.kittyId || !session.chatId && kind !== "close") throw new ConnectorError("session_incomplete", "Esta sesión no terminó de crearse.", 409);
  if (session.kittyId) await client.kitty(session.kittyId, session.kittyName, workspace.providerName);
  const chat = session.chatId && kind !== "close" ? await client.chat(session.chatId, session.kittyId!) : null;
  const held = session.held && Date.now() - session.updatedAt.getTime() < 5 * 60_000;
  if (kind === "message" && held) throw new ConnectorError("manual_control", "Devuelva el control al asistente antes de enviar otra tarea.", 409);
  if (kind === "message" && chat?.working) throw new ConnectorError("task_busy", "La tarea actual sigue en curso. Espere o solicite cancelarla.", 409);
  if (kind === "input" && !held) throw new ConnectorError("manual_control_required", "Tome el control manual antes de usar el ratón o teclado.", 409);
  await sessionFor(id, user, cleanup);
  const row = await prisma.$transaction(async tx => {
    await lockWorkspace(workspace, user, tx);
    if (needsModelPolicy) await policyAllowsAction(tx);
    const locked = await tx.altazorComputerSession.updateMany({ where: { id, ownerId: actor.id, state: session.state, expiresAt: { gt: new Date() } }, data: { updatedAt: session.updatedAt } });
    if (!locked.count) throw new ConnectorError("session_changed", "La sesión cambió o venció. Actualice antes de actuar.", 409);
    if (kind === "message" && await tx.altazorComputerAction.findFirst({ where: { sessionId: id, kind: "message", status: { in: ["sending", "unknown"] } }, select: { id: true } })) throw new ConnectorError("task_unconfirmed", "Existe una tarea sin confirmación. Compruebe el chat o cierre la sesión; no se reenviará automáticamente.", 409);
    return tx.altazorComputerAction.create({ data: { ownerId: actor.id, sessionId: id, requestId, kind, inputHash } });
  });
  try {
    await unchangedWorkspace(workspace, user); await sessionFor(id, user, cleanup);
    if (needsModelPolicy) await policyAllowsAction();
    const result = await run(client, session);
    await sessionFor(id, user, cleanup);
    const saved = await prisma.altazorComputerAction.update({ where: { id: row.id }, data: { status: "completed", resultJson: JSON.stringify(result) } });
    return actionView(saved);
  } catch (error) {
    await prisma.altazorComputerAction.update({ where: { id: row.id }, data: { status: "unknown", resultJson: null } });
    throw error;
  }
}
export async function sendComputerMessage(user: CausaAccessUser, id: string, input: ComputerMessage) {
  if (input.confirmed !== true || !input.text.trim() || input.text.length > 16000) throw new ConnectorError("task_approval_required", "Revise y autorice una tarea de hasta 16000 caracteres antes de enviarla.", 400);
  const files = inspectSelectedFiles(input.files), safeHashInput = { text: input.text, files: files.map(file => ({ name: file.name, mime: file.mime, hash: digest(file.data) })) };
  return executeAction(user, id, "message", input.requestId, safeHashInput, async (client, session) => {
    if (session.held && Date.now() - session.updatedAt.getTime() < 5 * 60_000) throw new ConnectorError("manual_control", "Devuelva el control al asistente antes de enviar otra tarea.", 409);
    const status = await client.chat(session.chatId!, session.kittyId!);
    if (status.working) throw new ConnectorError("task_busy", "La tarea actual sigue en curso. Espere o solicite cancelarla.", 409);
    await policyAllowsAction();
    return client.send(session.chatId!, input.text, files);
  });
}
export async function controlComputer(user: CausaAccessUser, id: string, requestId: string, hold: boolean) {
  return executeAction(user, id, "control", requestId, { hold }, async (client, session) => {
    const result = await client.control(session.kittyId!, hold);
    await prisma.altazorComputerSession.update({ where: { id }, data: { held: result.held } }); return result;
  });
}
export async function inputComputer(user: CausaAccessUser, id: string, requestId: string, input: PersonInput) {
  const safeInput = inputSchema.parse(input);
  return executeAction(user, id, "input", requestId, safeInput, async (client, session) => {
    if (!session.held || Date.now() - session.updatedAt.getTime() >= 5 * 60_000) throw new ConnectorError("manual_control_required", "Tome el control manual antes de usar el ratón o teclado.", 409);
    const result = await client.input(session.kittyId!, safeInput);
    await prisma.altazorComputerSession.update({ where: { id }, data: { updatedAt: new Date() } }); return result;
  });
}
export async function cancelComputerTask(user: CausaAccessUser, id: string, requestId: string) { return executeAction(user, id, "cancel", requestId, {}, (client, session) => client.cancel(session.chatId!)); }
export async function closeComputerSession(user: CausaAccessUser, id: string, requestId: string) {
  return executeAction(user, id, "close", requestId, {}, async (client, session) => {
    if (session.chatId) await client.cancel(session.chatId);
    await client.control(session.kittyId!, false);
    await client.stop(session.kittyId!);
    // The result is committed before the state changes; no automatic retry on a lost response.
    return { stopped: true };
  }, true).then(async result => { if (result.status === "completed") await prisma.altazorComputerSession.update({ where: { id }, data: { state: "closed", held: false } }); return result; });
}
export async function computerScreenshot(user: CausaAccessUser, id: string) {
  const { workspace, session } = await sessionFor(id, user), client = await readyGateway(workspace);
  if (!session.kittyId) throw new ConnectorError("desktop_starting", "El escritorio todavía no está disponible.", 409);
  await client.kitty(session.kittyId, session.kittyName, workspace.providerName);
  const png = await client.screenshot(session.kittyId); await sessionFor(id, user); return png;
}
