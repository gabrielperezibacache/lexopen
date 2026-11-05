import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import type { AltazorComputerAction, AltazorComputerSession, AltazorComputerWorkspace, PrismaClient, Prisma } from "@prisma/client";
import { assertCausaAccess, type CausaAccessUser } from "@/lib/auth/causa-access";
import { altazorActor, altazorScopeKey } from "@/lib/altazor/access";
import { normalizeAssistantFirmPolicy } from "@/lib/assistant/firm-policy";
import { ConnectorError, digest, encryptionKey, seal, unseal } from "@/lib/personal-connectors/core";
import { assertComputerEnabled, assertSessionLive, COMPUTER_LIMITS, computerEnabled, endpointFor, inputSchema, inspectSelectedFiles, type PersonInput } from "./policy";
import { KittiesGateway } from "./gateway";
import type { ComputerActivity, ComputerActivityState, ComputerMessage, ComputerSessionSummary, ComputerSessionView, ComputerStatus } from "./types";
import { assertComputerPolicy, computerPolicyAllowed, COMPUTER_LOCAL_ONLY_REASON } from "./privacy";
import { computerOperationHash } from "./operation-hash";
import { prepareSecretUse, redeemSecretUse, revokeSecretUse } from "@/lib/altazor/secrets/service";
import type { PrepareSecretUseInput, SecretTarget } from "@/lib/altazor/secrets/policy";
import { normalizeConnectorNames } from "@/lib/altazor/connectors/policy";
import { connectorKind } from "@/lib/altazor/connectors/catalog";

type Client = PrismaClient | Prisma.TransactionClient;
const credentialContext = (row: Pick<AltazorComputerWorkspace, "id" | "ownerId" | "scopeKey">) => `altazor:computer:${row.ownerId}:${row.id}:${row.scopeKey}`;
async function computerPolicy(db: Client = prisma) { return normalizeAssistantFirmPolicy(await db.firmSettings.findFirst({ select: { assistantLlmMode: true } })).assistantLlmMode; }
async function policyAllowsAction(db: Client = prisma) { assertComputerPolicy(await computerPolicy(db)); }
function sessionConnectors(row: AltazorComputerSession) { const names: unknown = JSON.parse(row.connectorNamesJson); if (!Array.isArray(names) || names.some(name => typeof name !== "string")) throw new ConnectorError("connector_selection", "La selección de conexiones requiere revisión.", 409); return normalizeConnectorNames(names.length ? names : ["-"]); }
function summary(row: AltazorComputerSession): ComputerSessionSummary { const names = sessionConnectors(row), renewableUntil = row.createdAt.getTime() + COMPUTER_LIMITS.renewalWindowMs; return { id: row.id, state: row.state === "closed" ? "closed" : row.expiresAt.getTime() <= Date.now() ? "expired" : row.state, expiresAt: row.expiresAt.toISOString(), renewableUntil: new Date(renewableUntil).toISOString(), canRenew: ["ready", "starting"].includes(row.state) && renewableUntil > Date.now(), requiresStop: ["creating", "ready", "starting", "unknown"].includes(row.state), held: row.held && Date.now() - row.updatedAt.getTime() < 5 * 60_000, createdAt: row.createdAt.toISOString(), connectors: names[0] === "-" ? [] : names }; }
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
  // Cleanup only reaches this path from the explicit cancel/close action kinds.
  // It retains current ownership, workspace and case access, even for receipt replay.
  if (!cleanup) assertSessionLive(session);
  return { ...access, session };
}
function gateway(workspace: AltazorComputerWorkspace) {
  const credential = unseal<{ token: string }>(workspace.credentialEnc!, credentialContext(workspace));
  return new KittiesGateway(workspace.endpoint, credential.token);
}
async function readyGateway(workspace: AltazorComputerWorkspace, recordHealth = true) {
  const client = gateway(workspace), known = await prisma.altazorComputerSession.findMany({ where: { workspaceId: workspace.id, ownerId: workspace.ownerId }, select: { kittyName: true } });
  try {
    const ready = await client.readiness(workspace.providerName, known.map(row => row.kittyName));
    if (recordHealth) await prisma.altazorComputerWorkspace.updateMany({ where: { id: workspace.id, credentialEnc: workspace.credentialEnc, enabled: true }, data: { lastVerifiedAt: new Date(), gatewayVersion: ready.version, lastErrorCode: null } });
    return client;
  } catch (error) {
    if (recordHealth) await prisma.altazorComputerWorkspace.updateMany({ where: { id: workspace.id }, data: { lastErrorCode: error instanceof ConnectorError ? error.code : "gateway_unavailable", lastVerifiedAt: null } });
    throw error;
  }
}
export async function computerStatus(user: CausaAccessUser, causaId?: string | null, canConfigure = false, requestedSessionId?: string | null): Promise<ComputerStatus> {
  const actor = await scopedActor(user, causaId);
  const workspace = await prisma.altazorComputerWorkspace.findUnique({ where: { ownerId_scopeKey: { ownerId: actor.id, scopeKey: altazorScopeKey(causaId) } } });
  const enabled = computerEnabled(), configured = Boolean(workspace?.enabled && workspace.credentialEnc);
  const policyAllowed = computerPolicyAllowed(await computerPolicy());
  const sessions: AltazorComputerSession[] = [];
  if (workspace) {
    const where = { ownerId: actor.id, workspaceId: workspace.id };
    const [unfinished, recent] = await Promise.all([
      prisma.altazorComputerSession.findMany({ where: { ...where, state: { in: ["creating", "ready", "starting", "unknown"] } }, orderBy: { createdAt: "desc" }, take: 15 }),
      prisma.altazorComputerSession.findMany({ where, orderBy: { createdAt: "desc" }, take: 15 }),
    ]);
    // Unconfirmed desktops must remain discoverable so expiry can never leave the
    // professional unable to stop one that fell out of the recent-history list.
    for (const row of [...unfinished, ...recent]) if (sessions.length < 15 && !sessions.some(session => session.id === row.id)) sessions.push(row);
  }
  if (requestedSessionId && !sessions.some(session => session.id === requestedSessionId)) {
    const requested = workspace ? await prisma.altazorComputerSession.findFirst({ where: { id: requestedSessionId, ownerId: actor.id, workspaceId: workspace.id } }) : null;
    if (!requested) throw new ConnectorError("session_not_found", "Sesión no encontrada o sin acceso actual.", 404);
    sessions.push(requested);
  }
  return { enabled, configured, policyAllowed, canConfigure: enabled && canConfigure, state: !enabled ? "disabled" : !policyAllowed ? "error" : !configured ? "unconfigured" : workspace?.lastErrorCode ? "error" : "configured", workspaceId: workspace?.id || null, provider: workspace?.providerName || null, version: workspace?.gatewayVersion || null, lastVerifiedAt: workspace?.lastVerifiedAt?.toISOString() || null, reason: !enabled ? "El computador opcional está desactivado en este Host." : !policyAllowed ? COMPUTER_LOCAL_ONLY_REASON : !configured ? "Prepara un escritorio independiente para este profesional y este espacio desde el equipo principal." : workspace?.lastErrorCode ? "La última comprobación no confirmó un escritorio disponible. Compruebe el gateway." : null, runtime: "container", sessions: sessions.map(summary) };
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
    if (await tx.altazorComputerSession.count({ where: { workspaceId: existing.id, state: { in: ["creating", "ready", "starting", "unknown"] } } })) throw new ConnectorError("sessions_active", "Cierre las sesiones activas antes de cambiar la autorización o proveedor.", 409);
    return tx.altazorComputerWorkspace.update({ where: { id: existing.id }, data });
  });
  return computerStatus(user, input.causaId, true);
}
export async function disableComputer(user: CausaAccessUser, workspaceId: string) {
  const { actor, workspace } = await workspaceFor(workspaceId, user);
  await prisma.$transaction(async tx => {
    await lockWorkspace(workspace, user, tx);
    const active = await tx.altazorComputerSession.count({ where: { workspaceId, ownerId: actor.id, state: { in: ["creating", "ready", "starting", "unknown"] } } });
    if (active) throw new ConnectorError("sessions_active", "Cierre las sesiones activas antes de retirar la autorización del gateway.", 409);
    await tx.altazorComputerWorkspace.update({ where: { id: workspace.id }, data: { enabled: false, credentialEnc: null, lastVerifiedAt: null } });
  });
  return computerStatus(user, workspace.causaId);
}
export async function verifyComputer(user: CausaAccessUser, workspaceId: string) {
  const { workspace } = await workspaceFor(workspaceId, user); await readyGateway(workspace); await workspaceFor(workspaceId, user);
  return computerStatus(user, workspace.causaId);
}
export async function createComputerSession(user: CausaAccessUser, workspaceId: string, requestId: string, connectors: string[] = []) {
  const { actor, workspace } = await workspaceFor(workspaceId, user);
  await policyAllowsAction();
  const replay = await prisma.altazorComputerSession.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId } } });
  const selected = normalizeConnectorNames(connectors.length ? connectors : ["-"]), connectorNamesJson = JSON.stringify(selected[0] === "-" ? [] : selected);
  if (replay) { if (replay.workspaceId !== workspaceId || replay.connectorNamesJson !== connectorNamesJson) throw new ConnectorError("request_conflict", "La operación corresponde a otro espacio o selección de conexiones.", 409); return summary(replay); }
  if (await prisma.altazorComputerSession.count({ where: { workspaceId, ownerId: actor.id, state: { in: ["creating", "ready", "starting", "unknown"] } } })) throw new ConnectorError("session_active", "Abra o cierre la sesión activa antes de crear otra.", 409);
  const client = await readyGateway(workspace), id = randomUUID(), kittyName = `altazor-${digest(id).slice(0, 22)}`;
  if (connectors.length) {
    await client.requireConnectorGate();
    const inventory = await client.connectorSettings();
    if (selected.some(name => !inventory.connections.some(connection => { const kind = connectorKind(connection.kind), runtime = inventory.catalog.find(entry => entry.id === connection.kind); return connection.name === name && connection.configured && !connection.needsSignIn && kind && !("blockedReason" in kind) && runtime?.available && !runtime.blockedReason; }))) throw new ConnectorError("connector_unavailable", "Compruebe e inicie sesión en las conexiones elegidas antes de abrir este escritorio.", 409);
  }
  const row = await prisma.$transaction(async tx => {
    await lockWorkspace(workspace, user, tx); await policyAllowsAction(tx);
    if (await tx.altazorConnectorOperation.count({ where: { workspaceId, status: { in: ["sending", "unknown"] } } })) throw new ConnectorError("connector_config_pending", "Hay un cambio de conexión sin confirmar. Compruébelo antes de abrir un escritorio.", 409);
    if (await tx.altazorComputerSession.count({ where: { workspaceId, ownerId: actor.id, state: { in: ["creating", "ready", "starting", "unknown"] } } })) throw new ConnectorError("session_active", "Ya hay una sesión activa en este espacio.", 409);
    return tx.altazorComputerSession.create({ data: { id, ownerId: actor.id, workspaceId, requestId, kittyName, connectorNamesJson, expiresAt: new Date(Date.now() + COMPUTER_LIMITS.sessionMs) } });
  });
  try {
    await unchangedWorkspace(workspace, user); await policyAllowsAction();
    let kitty = await client.createKitty(kittyName, workspace.providerName, selected, !connectors.length);
    await prisma.altazorComputerSession.update({ where: { id }, data: { kittyId: kitty.id, state: "starting" } });
    if (connectors.length) { for (const name of selected) await client.setApprovalRule(kitty.id, name); await client.startKitty(kitty.id); kitty = await client.kitty(kitty.id, kittyName, workspace.providerName, selected); }
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
export async function readComputerSession(user: CausaAccessUser, id: string, passive = false): Promise<ComputerSessionView> {
  const { workspace, session } = await sessionFor(id, user), client = await readyGateway(workspace, !passive);
  if (!session.kittyId || !session.chatId) throw new ConnectorError("session_incomplete", "El gateway no confirmó la creación completa de esta sesión.", 409);
  const names = sessionConnectors(session), hasConnections = names[0] !== "-";
  if (hasConnections) await client.requireConnectorGate();
  const kitty = await client.kitty(session.kittyId, session.kittyName, workspace.providerName, names), chat = await client.chat(session.chatId, session.kittyId);
  const approvals = hasConnections ? await client.pendingApprovals(session.kittyId, session.chatId, names) : [];
  // Containers may finish starting after create returns. Persist this transition so
  // manual controls and one-use Secretos grants see the same state as the interface.
  if (!passive && session.state === "starting" && kitty.status === "running") await prisma.altazorComputerSession.updateMany({ where: { id, ownerId: session.ownerId, state: "starting", updatedAt: session.updatedAt }, data: { state: "ready" } });
  const current = await sessionFor(id, user);
  return { session: { ...summary(current.session), state: kitty.status === "running" ? "ready" : ["created", "starting"].includes(kitty.status) ? "starting" : kitty.status }, runtime: "container", kittyStatus: kitty.status, ...chat, approvals };
}

async function passiveControlHeld(session: AltazorComputerSession) {
  if (session.held) return true;
  // A renewed access window can clear an expired keyboard lease without asking
  // the gateway to return control. Only a confirmed release unpauses the preview.
  const lastControl = await prisma.altazorComputerAction.findFirst({
    where: { sessionId: session.id, ownerId: session.ownerId, kind: "control", status: { in: ["completed", "sending", "unknown"] } },
    orderBy: [{ updatedAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    select: { resultJson: true, status: true },
  });
  if (!lastControl) return false;
  if (lastControl.status !== "completed") return true;
  try { return JSON.parse(lastControl.resultJson ?? "{}").held !== false; }
  catch { return true; }
}

/** Passive display only. Never creates a session, takes control or sends a message. */
export async function readComputerActivity(user: CausaAccessUser, causaId?: string | null): Promise<ComputerActivity> {
  const status = await computerStatus(user, causaId);
  const reply = (state: ComputerActivityState, sessionId: string | null = null, monitor = false): ComputerActivity => ({ state, sessionId, monitor });
  if (!status.enabled) return reply("disabled");
  if (!status.policyAllowed) return reply("restricted");
  if (!status.configured) return reply("unconfigured");
  const candidate = status.sessions.find(session => session.requiresStop);
  if (!candidate) return reply("idle", null, true);
  if (candidate.state === "expired") return reply("expired", candidate.id, true);
  if (candidate.state === "creating") return reply("starting", candidate.id, true);
  if (!["starting", "ready"].includes(candidate.state)) return reply("unavailable", candidate.id, true);
  const before = await sessionFor(candidate.id, user);
  if (await passiveControlHeld(before.session)) return reply("paused", candidate.id, true);
  const view = await readComputerSession(user, candidate.id, true);
  const after = await sessionFor(candidate.id, user);
  if (!computerPolicyAllowed(await computerPolicy())) return reply("restricted");
  if (await passiveControlHeld(after.session)) return reply("paused", candidate.id, true);
  if (view.session.state !== "ready") return reply(view.session.state === "starting" ? "starting" : "unavailable", candidate.id, true);
  return reply(view.approvals.length ? "approval" : view.working ? "working" : "ready", candidate.id, true);
}
function actionView(row: AltazorComputerAction) { return { id: row.id, status: row.status === "sending" && Date.now() - row.createdAt.getTime() > 60_000 ? "unknown" : row.status, result: row.status === "completed" && row.resultJson ? JSON.parse(row.resultJson) as Record<string, unknown> : null }; }
function assertRenewable(session: AltazorComputerSession, now = Date.now()) {
  if (!["ready", "starting"].includes(session.state) || !session.kittyId || !session.chatId) throw new ConnectorError("session_unavailable", "Sólo puede mantener un escritorio confirmado que siga disponible.", 409);
  if (session.createdAt.getTime() + COMPUTER_LIMITS.renewalWindowMs <= now) throw new ConnectorError("renewal_window_expired", "Terminó el máximo de dos horas de este escritorio. Abra uno nuevo para continuar.", 410);
}
/** Human-only, atomic local authorization extension. It never creates or restarts a Kitty. */
export async function renewComputerSession(user: CausaAccessUser, id: string, input: { requestId: string; confirmed: true; causaId?: string | null }) {
  if (input.confirmed !== true) throw new ConnectorError("renewal_approval_required", "Confirme expresamente mantener este mismo escritorio durante 20 minutos más.", 400);
  const actor = await altazorActor(user), session = await prisma.altazorComputerSession.findFirst({ where: { id, ownerId: actor.id } });
  if (!session) throw new ConnectorError("session_not_found", "Sesión no encontrada o sin acceso actual.", 404);
  const { workspace } = await workspaceFor(session.workspaceId, actor);
  if (workspace.scopeKey !== altazorScopeKey(input.causaId) || workspace.causaId !== (input.causaId || null)) throw new ConnectorError("session_not_found", "Sesión no encontrada o sin acceso actual.", 404);
  await policyAllowsAction(); assertRenewable(session);
  const inputHash = computerOperationHash(actor.id, id, "renew", { causaId: input.causaId || null });
  const client = await readyGateway(workspace), names = sessionConnectors(session);
  if (names[0] !== "-") await client.requireConnectorGate();
  const kitty = await client.kitty(session.kittyId!, session.kittyName, workspace.providerName, names);
  if (!["running", "starting", "created"].includes(kitty.status)) throw new ConnectorError("session_unavailable", "El gateway no confirmó que este mismo escritorio siga disponible.", 409);
  await client.chat(session.chatId!, session.kittyId!);
  // Only local writes occur here. One transaction commits both the expiry and its
  // HMAC-bound receipt, without an automatic retry or a gateway mutation.
  return prisma.$transaction(async tx => {
    const currentActor = await altazorActor(user, tx);
    const lockedActor = await tx.user.updateMany({ where: { id: currentActor.id, role: currentActor.role, capabilityGrants: currentActor.capabilityGrants, capabilityRevokes: currentActor.capabilityRevokes }, data: { capabilityRevokes: currentActor.capabilityRevokes } });
    if (!lockedActor.count) throw new ConnectorError("actor_changed", "Sus permisos cambiaron. Actualice antes de continuar.", 409);
    await lockWorkspace(workspace, user, tx); await policyAllowsAction(tx);
    const current = await tx.altazorComputerSession.findFirst({ where: { id, ownerId: actor.id, workspaceId: workspace.id } });
    if (!current) throw new ConnectorError("session_not_found", "Sesión no encontrada o sin acceso actual.", 404);
    const now = Date.now(); assertRenewable(current, now);
    const existing = await tx.altazorComputerAction.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId: input.requestId } } });
    if (existing) { if (existing.sessionId !== id || existing.kind !== "renew" || existing.inputHash !== inputHash) throw new ConnectorError("request_conflict", "La operación corresponde a otra acción.", 409); return actionView(existing); }
    if (current.updatedAt.getTime() !== session.updatedAt.getTime() || current.expiresAt.getTime() !== session.expiresAt.getTime()) throw new ConnectorError("session_changed", "La sesión cambió. Actualice antes de mantenerla.", 409);
    if (await tx.altazorComputerSession.count({ where: { workspaceId: workspace.id, ownerId: actor.id, id: { not: id }, state: { in: ["creating", "ready", "starting", "unknown"] } } })) throw new ConnectorError("session_active", "Ya hay otro escritorio activo en este espacio. Compruébelo antes de mantener uno anterior.", 409);
    const expiresAt = new Date(Math.min(now + COMPUTER_LIMITS.sessionMs, current.createdAt.getTime() + COMPUTER_LIMITS.renewalWindowMs));
    const changed = await tx.altazorComputerSession.updateMany({ where: { id, ownerId: actor.id, workspaceId: workspace.id, state: current.state, updatedAt: current.updatedAt, expiresAt: current.expiresAt }, data: { expiresAt, updatedAt: new Date(Math.max(now, current.updatedAt.getTime() + 1)), held: current.held && now - current.updatedAt.getTime() < 5 * 60_000 } });
    if (!changed.count) throw new ConnectorError("session_changed", "La sesión cambió. Actualice antes de mantenerla.", 409);
    const row = await tx.altazorComputerAction.create({ data: { ownerId: actor.id, sessionId: id, requestId: input.requestId, kind: "renew", inputHash, status: "completed", resultJson: JSON.stringify({ renewed: true, expiresAt: expiresAt.toISOString(), renewableUntil: new Date(current.createdAt.getTime() + COMPUTER_LIMITS.renewalWindowMs).toISOString() }) } });
    return actionView(row);
  }, { isolationLevel: "ReadCommitted", timeout: 20_000 });
}
function cleanupSession(session: AltazorComputerSession) {
  if (!["creating", "starting", "ready", "unknown"].includes(session.state)) throw new ConnectorError("session_unavailable", "Este escritorio ya está detenido o no admite esta limpieza.", 409);
}
function actionSessionWhere(session: AltazorComputerSession, workspaceId: string, cleanup: boolean): Prisma.AltazorComputerSessionWhereInput {
  return { id: session.id, ownerId: session.ownerId, workspaceId, state: session.state, updatedAt: session.updatedAt, kittyId: session.kittyId, chatId: session.chatId, expiresAt: { equals: session.expiresAt, ...(!cleanup ? { gt: new Date() } : {}) } };
}
function matchingAction(row: AltazorComputerAction, sessionId: string, kind: string, inputHash: string) {
  if (row.sessionId !== sessionId || row.kind !== kind || row.inputHash !== inputHash) throw new ConnectorError("request_conflict", "La operación corresponde a otra acción.", 409);
  return row;
}
async function executeAction(user: CausaAccessUser, id: string, kind: string, requestId: string, input: unknown, run: (client: KittiesGateway, row: AltazorComputerSession, tx: Prisma.TransactionClient) => Promise<Record<string, unknown>>) {
  const cleanup = kind === "cancel" || kind === "close";
  const access = await sessionFor(id, user, cleanup), { actor, workspace } = access;
  const needsModelPolicy = !["cancel", "close", "connector_reject"].includes(kind);
  if (needsModelPolicy) await policyAllowsAction();
  let session = access.session;
  const inputHash = computerOperationHash(actor.id, id, kind, input);
  const existing = await prisma.altazorComputerAction.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId } } });
  if (existing) return actionView(matchingAction(existing, id, kind, inputHash));
  if (cleanup) cleanupSession(session);
  const client = await readyGateway(workspace);
  let kittyId = session.kittyId;
  if (kind === "close" && !session.kittyId) {
    const recovered = await client.kitty(session.kittyName, session.kittyName, workspace.providerName, sessionConnectors(session));
    // Recovery is a pinned GET only. Persist its id under the same claim CAS below.
    kittyId = recovered.id;
  }
  if (!kittyId || !session.chatId && kind !== "close") throw new ConnectorError("session_incomplete", "Esta sesión no terminó de crearse.", 409);
  await client.kitty(kittyId, session.kittyName, workspace.providerName, sessionConnectors(session));
  const chat = session.chatId ? await client.chat(session.chatId, kittyId) : null;
  const held = session.held && Date.now() - session.updatedAt.getTime() < 5 * 60_000;
  if (kind === "message" && held) throw new ConnectorError("manual_control", "Devuelva el control al asistente antes de enviar otra tarea.", 409);
  if (kind === "message" && chat?.working) throw new ConnectorError("task_busy", "La tarea actual sigue en curso. Espere o solicite cancelarla.", 409);
  if (kind === "input" && !held) throw new ConnectorError("manual_control_required", "Tome el control manual antes de usar el ratón o teclado.", 409);
  await sessionFor(id, user, cleanup);
  const claim = await prisma.$transaction(async tx => {
    await lockWorkspace(workspace, user, tx);
    const previous = await tx.altazorComputerAction.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId } } });
    if (previous) return { row: matchingAction(previous, id, kind, inputHash), claimed: false, session };
    if (needsModelPolicy) await policyAllowsAction(tx);
    const locked = await tx.altazorComputerSession.updateMany({ where: actionSessionWhere(session, workspace.id, cleanup), data: session.kittyId ? { updatedAt: session.updatedAt } : { kittyId } });
    if (!locked.count) throw new ConnectorError("session_changed", "La sesión cambió o venció. Actualice antes de actuar.", 409);
    if (kind === "message" && await tx.altazorComputerAction.findFirst({ where: { sessionId: id, kind: "message", status: { in: ["sending", "unknown"] } }, select: { id: true } })) throw new ConnectorError("task_unconfirmed", "Existe una tarea sin confirmación. Compruebe el chat o cierre la sesión; no se reenviará automáticamente.", 409);
    const row = await tx.altazorComputerAction.create({ data: { ownerId: actor.id, sessionId: id, requestId, kind, inputHash } });
    return { row, claimed: true, session: await tx.altazorComputerSession.findUniqueOrThrow({ where: { id } }) };
  });
  if (!claim.claimed) return actionView(claim.row);
  const row = claim.row; session = claim.session;
  try {
    await unchangedWorkspace(workspace, user); await sessionFor(id, user, cleanup);
    if (needsModelPolicy) await policyAllowsAction();
    // Serialize the outbound operation with credential typing, revocation and control
    // changes. Never retry a transaction which performs an external side effect.
    const outcome = await prisma.$transaction(async tx => {
      const liveActor = await altazorActor(user, tx);
      const userLock = await tx.user.updateMany({ where: { id: liveActor.id, role: liveActor.role, capabilityGrants: liveActor.capabilityGrants, capabilityRevokes: liveActor.capabilityRevokes }, data: { capabilityRevokes: liveActor.capabilityRevokes } });
      if (!userLock.count) throw new ConnectorError("actor_changed", "Sus permisos cambiaron. Actualice antes de continuar.", 409);
      await lockWorkspace(workspace, user, tx);
      const locked = await tx.altazorComputerSession.updateMany({ where: actionSessionWhere(session, workspace.id, cleanup), data: { updatedAt: session.updatedAt } });
      if (!locked.count) throw new ConnectorError("session_changed", "La sesión cambió. Actualice antes de actuar.", 409);
      const liveSession = await tx.altazorComputerSession.findUniqueOrThrow({ where: { id } });
      if (needsModelPolicy) await policyAllowsAction(tx);
      if (cleanup) {
        cleanupSession(liveSession);
        await client.kitty(liveSession.kittyId!, liveSession.kittyName, workspace.providerName, sessionConnectors(liveSession));
        if (liveSession.chatId) await client.chat(liveSession.chatId, liveSession.kittyId!);
      }
      const result = await run(client, liveSession, tx);
      if (!cleanup && kind !== "control") return { result, receipt: null };
      const controlAt = kind === "control" ? (await tx.altazorComputerSession.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })).updatedAt : undefined;
      // Commit confirmed cleanup or control and its receipt atomically while
      // the same owner/workspace/session locks still protect the outbound operation.
      const receipt = await tx.altazorComputerAction.update({ where: { id: row.id }, data: { status: "completed", resultJson: JSON.stringify(result), updatedAt: controlAt } });
      if (kind === "close") {
        const closed = await tx.altazorComputerSession.updateMany({ where: actionSessionWhere(liveSession, workspace.id, true), data: { state: "closed", held: false } });
        if (!closed.count) throw new ConnectorError("session_changed", "La sesión cambió antes de confirmar su cierre.", 409);
      }
      return { result, receipt };
    }, { isolationLevel: "ReadCommitted", timeout: 60_000 });
    await sessionFor(id, user, cleanup);
    if (outcome.receipt) return actionView(outcome.receipt);
    const saved = await prisma.altazorComputerAction.update({ where: { id: row.id }, data: { status: "completed", resultJson: JSON.stringify(outcome.result) } });
    return actionView(saved);
  } catch (error) {
    await prisma.altazorComputerAction.updateMany({ where: { id: row.id, status: "sending" }, data: { status: "unknown", resultJson: null } });
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
    if (sessionConnectors(session)[0] !== "-") await client.requireConnectorGate();
    return client.send(session.chatId!, input.text, files);
  });
}
export async function controlComputer(user: CausaAccessUser, id: string, requestId: string, hold: boolean) {
  return executeAction(user, id, "control", requestId, { hold }, async (client, session, tx) => {
    const result = await client.control(session.kittyId!, hold);
    await tx.altazorComputerSession.update({ where: { id }, data: { held: result.held, updatedAt: new Date(Math.max(Date.now(), session.updatedAt.getTime() + 1)) } }); return result;
  });
}
export async function inputComputer(user: CausaAccessUser, id: string, requestId: string, input: PersonInput) {
  const safeInput = inputSchema.parse(input);
  return executeAction(user, id, "input", requestId, safeInput, async (client, session, tx) => {
    if (!session.held || Date.now() - session.updatedAt.getTime() >= 5 * 60_000) throw new ConnectorError("manual_control_required", "Tome el control manual antes de usar el ratón o teclado.", 409);
    const result = await client.input(session.kittyId!, safeInput);
    await tx.altazorComputerSession.update({ where: { id }, data: { updatedAt: new Date() } }); return result;
  });
}
export async function cancelComputerTask(user: CausaAccessUser, id: string, requestId: string) { return executeAction(user, id, "cancel", requestId, {}, (client, session) => client.cancel(session.chatId!)); }
export async function closeComputerSession(user: CausaAccessUser, id: string, requestId: string) {
  return executeAction(user, id, "close", requestId, {}, async (client, session) => {
    if (session.chatId) await client.cancel(session.chatId);
    await client.stop(session.kittyId!);
    return { stopped: true };
  });
}
export async function computerScreenshot(user: CausaAccessUser, id: string, passive = false) {
  const { workspace, session } = await sessionFor(id, user);
  const assertPassive = async (current: AltazorComputerSession) => {
    if (!passive) return;
    await policyAllowsAction();
    // Even an expired manual lease may leave a secret field visible until control is released.
    if (await passiveControlHeld(current)) throw new ConnectorError("preview_paused", "Vista pausada durante el control manual.", 409);
  };
  await assertPassive(session);
  const client = await readyGateway(workspace, !passive);
  if (!session.kittyId) throw new ConnectorError("desktop_starting", "El escritorio todavía no está disponible.", 409);
  await client.kitty(session.kittyId, session.kittyName, workspace.providerName, sessionConnectors(session));
  const beforeFrame = passive ? (await sessionFor(id, user)).session : session;
  await assertPassive(beforeFrame);
  const png = await client.screenshot(session.kittyId);
  const afterFrame = (await sessionFor(id, user)).session;
  await assertPassive(afterFrame);
  if (passive && beforeFrame.updatedAt.getTime() !== afterFrame.updatedAt.getTime()) throw new ConnectorError("preview_changed", "El escritorio cambió durante la captura.", 409);
  return png;
}

// Origin and field are deliberately declarations by the person. This bridge verifies
// the private session and manual control; it does not claim DOM attestation.
async function secretTargetGateway(user: CausaAccessUser, target: SecretTarget) {
  const { workspace, session } = await sessionFor(target.sessionId, user);
  await policyAllowsAction();
  if (session.state !== "ready" || !session.kittyId || !session.chatId || !session.held || Date.now() - session.updatedAt.getTime() >= 5 * 60_000) throw new ConnectorError("manual_control_required", "Tome el control manual y seleccione el campo antes de escribir un secreto.", 409);
  const client = await readyGateway(workspace);
  await client.kitty(session.kittyId, session.kittyName, workspace.providerName, sessionConnectors(session));
  // Reassert upstream hold without releasing it, including on uncertain typing.
  const result = await client.control(session.kittyId, true);
  if (!result.held) throw new ConnectorError("manual_control_required", "No se pudo confirmar el control manual del escritorio.", 409);
  await sessionFor(target.sessionId, user);
  return { client, session };
}
export async function prepareComputerSecret(user: CausaAccessUser, id: string, input: PrepareSecretUseInput) {
  if (input.target.sessionId !== id) throw new ConnectorError("secret_session_mismatch", "El secreto corresponde a otra sesión.", 409);
  return prepareSecretUse(user, { requestId: input.requestId, secretId: input.secretId, revision: input.revision, target: input.target, confirmed: input.confirmed }, { verifyTarget: async (actor, target) => { await secretTargetGateway(actor, target); } });
}
export async function typeComputerSecret(user: CausaAccessUser, id: string, input: { grantId: string; target: SecretTarget; confirmed: true }) {
  if (input.target.sessionId !== id) throw new ConnectorError("secret_session_mismatch", "El secreto corresponde a otra sesión.", 409);
  let verified: Awaited<ReturnType<typeof secretTargetGateway>> | undefined;
  const result = await redeemSecretUse(user, input, async value => {
    if (!verified) throw new Error("Unverified secret target");
    try { await verified.client.input(verified.session.kittyId!, { action: "type", args: { text: value } }); }
    finally { await verified.client.control(verified.session.kittyId!, true); }
  }, { verifyTarget: async (actor, target) => { verified = await secretTargetGateway(actor, target); } });
  // No value is retained in an action receipt. The grant records only its one-use outcome.
  return result;
}
export async function cancelComputerSecret(user: CausaAccessUser, id: string, grantId: string) {
  await sessionFor(id, user);
  const grant = await prisma.altazorSecretGrant.findFirst({ where: { id: grantId, ownerId: user.id, sessionId: id }, select: { id: true } });
  if (!grant) throw new ConnectorError("secret_grant_not_found", "Autorización no encontrada para este escritorio.", 404);
  return revokeSecretUse(user, grantId);
}
export async function decideComputerApproval(user: CausaAccessUser, id: string, requestId: string, approvalId: string, approve: boolean) {
  return executeAction(user, id, approve ? "connector_approval" : "connector_reject", requestId, { approvalId, approve }, async (client, session) => {
    const names = sessionConnectors(session);
    if (names[0] === "-") throw new ConnectorError("connector_selection", "Esta sesión no tiene aplicaciones autorizadas.", 409);
    if (approve && session.held && Date.now() - session.updatedAt.getTime() < 5 * 60_000) throw new ConnectorError("manual_control", "Devuelva el control al asistente antes de autorizar una operación.", 409);
    return client.decideApproval(approvalId, session.kittyId!, session.chatId!, names, approve);
  });
}
