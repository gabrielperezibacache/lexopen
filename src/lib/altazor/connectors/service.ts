import type { AltazorComputerWorkspace, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { altazorActor, altazorScopeKey } from "@/lib/altazor/access";
import { assertCausaAccess, type CausaAccessUser } from "@/lib/auth/causa-access";
import { normalizeAssistantFirmPolicy } from "@/lib/assistant/firm-policy";
import { ConnectorError, digest, unseal } from "@/lib/personal-connectors/core";
import { assertComputerEnabled } from "../computer/policy";
import { assertComputerPolicy } from "../computer/privacy";
import { computerOperationHash } from "../computer/operation-hash";
import { KittiesGateway } from "../computer/gateway";
import { assertGatewayOAuthAllowed, connectorNameSchema, validateConnectorConfiguration } from "./policy";
import { EASY_OAUTH_PROVIDERS } from "./easy-oauth-providers";
import type { ConnectorConfiguration, ConnectorInventory } from "./types";
import { validatePersistentEasyOAuth, type PersistentEasyOAuthConfiguration } from "./persistent-oauth";

type Client = typeof prisma | Prisma.TransactionClient;
type Actor = CausaAccessUser;
async function access(user: Actor, id: string, db: Client = prisma) {
  assertComputerEnabled();
  const actor = await altazorActor(user, db), workspace = await db.altazorComputerWorkspace.findFirst({ where: { id, ownerId: actor.id } });
  if (!workspace || workspace.scopeKey !== altazorScopeKey(workspace.causaId)) throw new ConnectorError("workspace_not_found", "Espacio no encontrado o sin acceso actual.", 404);
  if (workspace.causaId) await assertCausaAccess(workspace.causaId, actor, { auditOverride: false }, db);
  if (!workspace.enabled || !workspace.credentialEnc) throw new ConnectorError("workspace_disabled", "Active primero el computador dedicado de este espacio.", 409);
  return { actor, workspace };
}
async function current(user: Actor, expected: AltazorComputerWorkspace, db: Client = prisma) {
  const value = await access(user, expected.id, db);
  if (value.workspace.credentialEnc !== expected.credentialEnc || value.workspace.endpoint !== expected.endpoint || value.workspace.providerName !== expected.providerName) throw new ConnectorError("workspace_changed", "La configuración cambió. Actualice el espacio antes de continuar.", 409);
  return value;
}
async function policy(db: Client = prisma) { assertComputerPolicy(normalizeAssistantFirmPolicy(await db.firmSettings.findFirst({ select: { assistantLlmMode: true } })).assistantLlmMode); }
function gateway(workspace: AltazorComputerWorkspace) {
  const credential = unseal<{ token: string }>(workspace.credentialEnc!, `altazor:computer:${workspace.ownerId}:${workspace.id}:${workspace.scopeKey}`);
  return new KittiesGateway(workspace.endpoint, credential.token);
}
async function ready(workspace: AltazorComputerWorkspace) {
  const client = gateway(workspace), sessions = await prisma.altazorComputerSession.findMany({ where: { ownerId: workspace.ownerId, workspaceId: workspace.id }, select: { kittyName: true } });
  const health = await client.readiness(workspace.providerName, sessions.map(row => row.kittyName));
  return { client, health };
}
async function inventory(client: KittiesGateway, health: { version: string; connectorGate: boolean; persistentOAuth?: boolean; cloudFileOAuth?: boolean }): Promise<ConnectorInventory> {
  return { ...await client.connectorSettings(), gateReady: health.connectorGate, version: health.version, persistentOAuthReady: health.persistentOAuth === true, cloudFileOAuthReady: health.cloudFileOAuth === true };
}
export async function connectorInventory(user: Actor, workspaceId: string) {
  const { workspace } = await access(user, workspaceId), { client, health } = await ready(workspace);
  const result = await inventory(client, health); await current(user, workspace);
  const operations = await prisma.altazorConnectorOperation.findMany({ where: { workspaceId, ownerId: workspace.ownerId, status: { in: ["sending", "unknown"] } }, select: { id: true, kind: true, status: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 20 });
  return { ...result, operations: operations.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })) };
}
/** Check a first account before asking its provider for consent. An older
 * persistent runtime may still renew an alias it already stores. No write. */
export async function assertPersistentOAuthImportReady(user: Actor, workspaceId: string, name: string, kind: PersistentEasyOAuthConfiguration["kind"]) {
  connectorNameSchema.parse(name);
  const { actor, workspace } = await access(user, workspaceId);
  const provider = kind === "google-workspace" ? "google" : kind === "microsoft-365" ? "microsoft" : "dropbox";
  if (name !== `altazor-${provider}-${digest(`${actor.id}:${workspaceId}`).slice(0, 16)}`) throw new ConnectorError("oauth_binding_changed", "La conexión no corresponde a este profesional y espacio.", 409);
  await policy();
  const { client } = await ready(workspace);
  await client.requirePersistentOAuth();
  const settings = await client.connectorSettings(), existing = settings.connections.find(connection => connection.name === name);
  if (existing && existing.kind !== kind) throw new ConnectorError("connector_unavailable", "No se pudo confirmar el servicio de esta conexión.", 409);
  if (!existing) await client.requireOAuthAliasCreation();
  await current(actor, workspace);
}
function receipt(row: { id: string; status: string; createdAt: Date }) { return { id: row.id, status: row.status === "sending" && Date.now() - row.createdAt.getTime() > 60_000 ? "unknown" : row.status }; }

async function mutation(user: Actor, workspaceId: string, requestId: string, kind: string, input: unknown, run: (client: KittiesGateway) => Promise<Record<string, unknown>>, cleanup = false, preflight?: (client: KittiesGateway) => Promise<void>, expectedWorkspace?: AltazorComputerWorkspace) {
  const { actor, workspace } = await access(user, workspaceId);
  if (expectedWorkspace && (workspace.id !== expectedWorkspace.id || workspace.ownerId !== expectedWorkspace.ownerId || workspace.scopeKey !== expectedWorkspace.scopeKey || workspace.causaId !== expectedWorkspace.causaId || workspace.endpoint !== expectedWorkspace.endpoint || workspace.credentialEnc !== expectedWorkspace.credentialEnc || workspace.providerName !== expectedWorkspace.providerName)) throw new ConnectorError("workspace_changed", "El destino autorizado cambió. Inicie una conexión nueva antes de enviar credenciales.", 409);
  if (!cleanup) await policy();
  const inputHash = computerOperationHash(actor.id, workspaceId, `connector:${kind}`, input);
  const previous = await prisma.altazorConnectorOperation.findUnique({ where: { ownerId_requestId: { ownerId: actor.id, requestId } } });
  if (previous) {
    if (previous.workspaceId !== workspaceId || previous.kind !== kind || previous.inputHash !== inputHash) throw new ConnectorError("request_conflict", "La solicitud corresponde a otra operación.", 409);
    return { operation: receipt(previous), inventory: await connectorInventory(user, workspaceId) };
  }
  const { client, health } = await ready(workspace);
  if (preflight) await preflight(client);
  const row = await prisma.$transaction(async tx => {
    await current(user, workspace, tx); if (!cleanup) await policy(tx);
    const locked = await tx.altazorComputerWorkspace.updateMany({ where: { id: workspaceId, ownerId: actor.id, credentialEnc: workspace.credentialEnc, enabled: true }, data: { updatedAt: workspace.updatedAt } });
    if (!locked.count) throw new ConnectorError("workspace_changed", "La configuración cambió. Actualice el espacio.", 409);
    if (await tx.altazorComputerSession.count({ where: { workspaceId, ownerId: actor.id, state: { in: ["creating", "starting", "ready", "unknown"] } } })) throw new ConnectorError("sessions_active", "Detenga expresamente el escritorio antes de cambiar una conexión, aunque haya vencido su acceso.", 409);
    if (await tx.altazorConnectorOperation.count({ where: { workspaceId, ownerId: actor.id, status: { in: ["sending", "unknown"] } } })) throw new ConnectorError("connector_operation_pending", "Revise la operación anterior antes de cambiar conexiones.", 409);
    // Changing a native connection in advanced settings invalidates its old OAuth
    // proof before the external write, including when its outcome is uncertain.
    const name = input && typeof input === "object" && "name" in input ? String(input.name) : "";
    if (["configure", "configure_persistent", "remove"].includes(kind)) for (const provider of EASY_OAUTH_PROVIDERS) {
      if (name === `altazor-${provider}-${digest(`${actor.id}:${workspaceId}`).slice(0, 16)}`) await tx.personalConnectorAccount.updateMany({ where: { ownerId: actor.id, provider: `altazor-desktop:${workspaceId}:${provider}` }, data: { status: "reconnect_required", lastVerifiedAt: null, credentialsEnc: null } });
    }
    return tx.altazorConnectorOperation.create({ data: { ownerId: actor.id, workspaceId, requestId, kind, inputHash } });
  });
  try {
    await current(user, workspace); if (!cleanup) await policy();
    const result = await run(client);
    await current(user, workspace);
    const saved = await prisma.altazorConnectorOperation.update({ where: { id: row.id }, data: { status: "completed" } });
    return { operation: receipt(saved), inventory: await inventory(client, health), ...result };
  } catch (error) {
    await prisma.altazorConnectorOperation.update({ where: { id: row.id }, data: { status: "unknown" } });
    throw error;
  }
}
export async function configureConnector(user: Actor, workspaceId: string, requestId: string, name: string, value: ConnectorConfiguration, expectedWorkspace?: AltazorComputerWorkspace) {
  connectorNameSchema.parse(name); const config = validateConnectorConfiguration(value);
  return mutation(user, workspaceId, requestId, "configure", { name, config }, async client => {
    await client.setConnector(name, config); return {};
  }, false, async client => {
    const before = await client.connectorSettings();
    const available = before.catalog.find(kind => kind.id === config.kind);
    if (!available?.available || available.blockedReason) throw new ConnectorError("connector_unavailable", available?.blockedReason || "Este gateway no ofrece la conexión elegida.", 409);
    if (Object.keys(config.settings).some(name => !available.fields.some(field => field.name === name))) throw new ConnectorError("connector_fields_unavailable", "El gateway no ofrece todos los campos de esta configuración.", 409);
    const old = before.connections.find(row => row.name === name);
    if (old && old.kind !== config.kind) throw new ConnectorError("connector_kind_changed", "Quite la conexión existente antes de cambiar su servicio.", 409);
  }, expectedWorkspace);
}
/** Internal OAuth callback only; app and refresh credentials never enter a browser form or the model. */
export async function configurePersistentEasyOAuth(user: Actor, workspaceId: string, requestId: string, name: string, value: PersistentEasyOAuthConfiguration, expectedWorkspace: AltazorComputerWorkspace) {
  connectorNameSchema.parse(name); validatePersistentEasyOAuth(value);
  const provider = value.kind === "google-workspace" ? "google" : value.kind === "microsoft-365" ? "microsoft" : "dropbox";
  if (name !== `altazor-${provider}-${digest(`${user.id}:${workspaceId}`).slice(0, 16)}`) throw new ConnectorError("oauth_binding_changed", "La conexión no corresponde a este profesional y espacio.", 409);
  return mutation(user, workspaceId, requestId, "configure_persistent", { name, value }, async client => ({ ...await client.setPersistentEasyOAuth(name, value) }), false, async client => {
    await client.requirePersistentOAuth();
    if (value.publicClient) await client.requireCloudFileOAuth();
    const before = await client.connectorSettings(), available = before.catalog.find(kind => kind.id === value.kind), old = before.connections.find(row => row.name === name);
    if (!available?.available || available.blockedReason || old && old.kind !== value.kind) throw new ConnectorError("connector_unavailable", "No se pudo confirmar el servicio de esta conexión.", 409);
  }, expectedWorkspace);
}
export async function removeConnector(user: Actor, workspaceId: string, requestId: string, name: string) {
  connectorNameSchema.parse(name);
  return mutation(user, workspaceId, requestId, "remove", { name }, async client => { await client.removeConnector(name); return {}; }, true);
}
export async function beginConnectorOAuth(user: Actor, workspaceId: string, requestId: string, name: string) {
  connectorNameSchema.parse(name);
  return mutation(user, workspaceId, requestId, "oauth", { name }, async client => ({ oauth: await client.connectorOAuth(name) }), false, async client => {
    const settings = await client.connectorSettings();
    assertGatewayOAuthAllowed(settings.connections.find(connection => connection.name === name)?.kind);
  });
}
export async function testConnector(user: Actor, workspaceId: string, name: string) {
  connectorNameSchema.parse(name); const { workspace } = await access(user, workspaceId); await policy();
  const { client } = await ready(workspace), result = await client.testConnector(name); await current(user, workspace); await policy(); return result;
}
export async function acknowledgeConnectorOperation(user: Actor, workspaceId: string, id: string) {
  const { actor, workspace } = await access(user, workspaceId), { client } = await ready(workspace);
  await client.connectorSettings(); await current(user, workspace);
  const updated = await prisma.altazorConnectorOperation.updateMany({ where: { id, ownerId: actor.id, workspaceId, OR: [{ status: "unknown" }, { status: "sending", createdAt: { lt: new Date(Date.now() - 60_000) } }] }, data: { status: "acknowledged" } });
  if (!updated.count) throw new ConnectorError("connector_operation_changed", "La operación sigue en curso o ya fue revisada.", 409);
  // This acknowledges uncertainty; it never replays a credential or claims the external write succeeded.
  return connectorInventory(user, workspaceId);
}
