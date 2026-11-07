import { createHash, randomUUID } from "node:crypto";
import type { AltazorComputerWorkspace, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { altazorActor, altazorScopeKey } from "@/lib/altazor/access";
import { assertCausaAccess } from "@/lib/auth/causa-access";
import { canSome } from "@/lib/auth/permissions";
import { ConnectorError, constantEqual, digest, encryptionKey, randomToken, seal, unseal } from "@/lib/personal-connectors/core";
import type { ConnectorActor } from "@/lib/personal-connectors/linkedin/account";
import { assertComputerEnabled } from "../computer/policy";
import { assertComputerPolicy } from "../computer/privacy";
import { normalizeAssistantFirmPolicy } from "@/lib/assistant/firm-policy";
import { computerOperationHash } from "../computer/operation-hash";
import { configureConnector, connectorInventory, testConnector } from "./service";
import { oauthFailureReason, readOAuthTokenResponse } from "./oauth-token-response";
import { checkGithubApplication } from "./github-application-check";

import { EASY_OAUTH_PROVIDERS, type EasyOAuthProvider } from "./easy-oauth-providers";

export { EASY_OAUTH_PROVIDERS, type EasyOAuthProvider } from "./easy-oauth-providers";
type Client = typeof prisma | Prisma.TransactionClient;
type Options = { env?: Readonly<Record<string, string | undefined>>; fetcher?: typeof fetch };
const prefix = "altazor-desktop:", callbackPath = "/api/altazor/connectors/oauth/callback";
const setupReason = "El administrador debe habilitar esta conexión en LexOpen una sola vez.";
const specifications = {
  google: { label: "Google Workspace", kind: "google-workspace", scopes: ["https://www.googleapis.com/auth/drive.metadata.readonly"], authorize: "https://accounts.google.com/o/oauth2/v2/auth", token: "https://oauth2.googleapis.com/token", registrationUrl: "https://console.cloud.google.com/auth/clients" },
  github: { label: "GitHub", kind: "github", scopes: ["read:user"], authorize: "https://github.com/login/oauth/authorize", token: "https://github.com/login/oauth/access_token", registrationUrl: "https://github.com/settings/developers" },
  dropbox: { label: "Dropbox", kind: "dropbox", scopes: ["account_info.read", "files.content.read", "files.metadata.read"], authorize: "https://www.dropbox.com/oauth2/authorize", token: "https://api.dropboxapi.com/oauth2/token", registrationUrl: "https://www.dropbox.com/developers/apps" },
} as const;
type Config = { provider: EasyOAuthProvider; clientId: string; clientSecret: string; origin: string; redirectUri: string; configured: boolean; source: "environment" | "saved" | "none"; reason: string | null };
type Binding = { workspaceId: string; workspaceBinding: string; configurationBinding: string; connectionName: string; causaId: string | null; state: string; verifier: string; nonce: string };
type ConnectionProof = { workspaceBinding: string; connectionName: string; expiresAt: string | null; scopes: string[] };
export type EasyOAuthAttempt = { id: string; provider: EasyOAuthProvider; state: "pending" | "exchanging" | "completed" | "failed" | "cancelled" | "expired"; reason: string | null };
export type EasyOAuthStatus = { workspaceId: string; causaId: string | null; canAdmin: boolean; requiresStop: boolean; providers: { provider: EasyOAuthProvider; label: string; available: boolean; reason: string | null; scopes: string[]; connectionName: string; state: "blocked" | "idle" | "pending" | "connected" | "failed" | "expired" | "reconnect_required"; connected: boolean; tested: boolean; hasStoredConnection: boolean; canDisconnect: boolean; expiresAt: string | null; lastVerifiedAt: string | null }[]; attempt?: EasyOAuthAttempt };
const attemptContext = (ownerId: string, id: string) => `altazor:desktop:oauth:${ownerId}:${id}`;
const proofContext = (ownerId: string, id: string) => `altazor:desktop:connection:${ownerId}:${id}`;
const setupContext = (provider: EasyOAuthProvider) => `altazor:desktop:oauth:operator:${provider}`;
const accountProvider = (workspaceId: string, provider: EasyOAuthProvider) => `${prefix}${workspaceId}:${provider}`;
export function easyConnectionName(ownerId: string, workspaceId: string, provider: EasyOAuthProvider) { return `altazor-${provider}-${digest(`${ownerId}:${workspaceId}`).slice(0, 16)}`; }
function validOrigin(value: string) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== "/" || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error();
  return url.origin;
}
async function configFor(provider: EasyOAuthProvider, options: Options = {}, db: Client = prisma): Promise<Config> {
  const env = options.env || process.env, key = provider.toUpperCase();
  let clientId = env[`ALTAZOR_${key}_CLIENT_ID`]?.trim() || "", clientSecret = env[`ALTAZOR_${key}_CLIENT_SECRET`]?.trim() || "", appUrl = env.APP_URL?.trim() || env.NEXT_PUBLIC_APP_URL?.trim() || "";
  let source: Config["source"] = clientId || clientSecret ? "environment" : "none";
  if (source === "none") {
    const row = await db.integrationConfig.findUnique({ where: { provider: `altazor-oauth-${provider}` } });
    if (row?.enabled) {
      try {
        const json = JSON.parse(row.configJson) as { credentialsEnc?: string };
        const saved = unseal<{ clientId: string; clientSecret: string; appUrl: string }>(json.credentialsEnc || "", setupContext(provider));
        clientId = saved.clientId; clientSecret = saved.clientSecret; appUrl ||= saved.appUrl; source = "saved";
      } catch { /* An unreadable operator configuration remains blocked. */ }
    }
  }
  let origin = "", reason: string | null = setupReason;
  try { origin = validOrigin(appUrl); encryptionKey(); if (clientId && clientSecret && clientId.length <= 1000 && clientSecret.length <= 4000 && !/[\r\n]/.test(clientId + clientSecret)) reason = null; } catch { /* Explicitly unconfigured, never use another app's identity. */ }
  return { provider, clientId, clientSecret, origin, redirectUri: origin ? origin + callbackPath : "", configured: reason === null, source, reason };
}
function requireConfig(config: Config) { if (!config.configured) throw new ConnectorError("oauth_unconfigured", setupReason, 503); return config; }
function appBinding(actor: ConnectorActor, workspaceId: string, config: Config) { return computerOperationHash(actor.id, workspaceId, "oauth-app", { clientId: config.clientId, secret: config.clientSecret, redirectUri: config.redirectUri }); }
function workspaceBinding(workspace: AltazorComputerWorkspace) { return computerOperationHash(workspace.ownerId, workspace.id, "oauth-workspace", { scope: workspace.scopeKey, causaId: workspace.causaId, endpoint: workspace.endpoint, credentialEnc: workspace.credentialEnc, provider: workspace.providerName }); }
export async function nativeOAuthActor(actor: ConnectorActor, db: Client = prisma) {
  const user = await db.user.findUnique({ where: { id: actor.id }, select: { id: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
  if (!user) throw new ConnectorError("session_required", "Vuelva a iniciar sesión en LexOpen.", 401);
  return altazorActor(user, db);
}
async function access(actor: ConnectorActor, workspaceId: string, db: Client = prisma) {
  assertComputerEnabled();
  const user = await nativeOAuthActor(actor, db), session = await db.user.findUnique({ where: { id: actor.id }, select: { sessionVersion: true } });
  if (!session || session.sessionVersion !== actor.sessionVersion || !/^[a-f0-9]{64}$/.test(actor.sessionHash)) throw new ConnectorError("session_required", "Vuelva a iniciar sesión en LexOpen.", 401);
  const workspace = await db.altazorComputerWorkspace.findFirst({ where: { id: workspaceId, ownerId: actor.id } });
  if (!workspace || workspace.scopeKey !== altazorScopeKey(workspace.causaId)) throw new ConnectorError("workspace_not_found", "Espacio no encontrado o sin acceso actual.", 404);
  if (workspace.causaId) await assertCausaAccess(workspace.causaId, user, { auditOverride: false }, db);
  if (!workspace.enabled || !workspace.credentialEnc) throw new ConnectorError("workspace_disabled", "Active primero el computador dedicado de este espacio.", 409);
  assertComputerPolicy(normalizeAssistantFirmPolicy(await db.firmSettings.findFirst({ select: { assistantLlmMode: true } })).assistantLlmMode);
  return { user, workspace };
}
async function noActiveSession(workspace: AltazorComputerWorkspace, db: Client = prisma) {
  if (await db.altazorComputerSession.count({ where: { workspaceId: workspace.id, ownerId: workspace.ownerId, state: { in: ["creating", "starting", "ready", "unknown"] } } })) throw new ConnectorError("sessions_active", "Detenga expresamente el escritorio antes de conectar una aplicación, aunque haya vencido su acceso. Su sesión no se cerrará automáticamente.", 409);
}
function bindingOf(row: { ownerId: string; id: string; resultEnc: string | null }) {
  if (!row.resultEnc) throw new ConnectorError("oauth_attempt_unavailable", "Inicie una conexión nueva.", 409);
  return unseal<Binding>(row.resultEnc, attemptContext(row.ownerId, row.id));
}
export async function easyOAuthSetupStatus(options: Options = {}, verifiedDisplayOrigin?: string) {
  return { providers: await Promise.all(EASY_OAUTH_PROVIDERS.map(async provider => { const config = await configFor(provider, options); return { provider, label: specifications[provider].label, configured: config.configured, source: config.source, callbackUri: config.redirectUri || (verifiedDisplayOrigin ? validOrigin(verifiedDisplayOrigin) + callbackPath : null), canEdit: config.source !== "environment", reason: config.reason, registrationUrl: specifications[provider].registrationUrl }; })) };
}
export async function saveEasyOAuthSetup(actor: ConnectorActor, input: { provider: EasyOAuthProvider; clientId: string; clientSecret: string; confirmed: true }, appOrigin: string, options: Options = {}) {
  const user = await nativeOAuthActor(actor);
  if (!canSome(user, "host.admin")) throw new ConnectorError("forbidden", "Sólo el administrador puede preparar las conexiones del Host.", 403);
  const config = await configFor(input.provider);
  if (config.source === "environment") throw new ConnectorError("oauth_managed_environment", "Esta conexión ya está administrada por la configuración del Host.", 409);
  if (input.confirmed !== true || !input.clientId.trim() || !input.clientSecret.trim() || input.clientId.length > 1000 || input.clientSecret.length > 4000 || /[\r\n]/.test(input.clientId + input.clientSecret)) throw new ConnectorError("oauth_setup_invalid", "Complete los datos de la aplicación registrada.");
  const appUrl = validOrigin(appOrigin), credentialsEnc = seal({ clientId: input.clientId.trim(), clientSecret: input.clientSecret.trim(), appUrl }, setupContext(input.provider));
  if (input.provider === "github") await checkGithubApplication(input.clientId.trim(), input.clientSecret.trim(), options.fetcher);
  await prisma.$transaction(async tx => {
    const current = await nativeOAuthActor(actor, tx); if (!canSome(current, "host.admin")) throw new ConnectorError("forbidden", "Sus permisos cambiaron.", 403);
    await tx.integrationConfig.upsert({ where: { provider: `altazor-oauth-${input.provider}` }, create: { provider: `altazor-oauth-${input.provider}`, enabled: true, configJson: JSON.stringify({ credentialsEnc }) }, update: { enabled: true, configJson: JSON.stringify({ credentialsEnc }) } });
    const pending = await tx.personalOAuthAttempt.findMany({ where: { provider: prefix + input.provider, phase: { in: ["pending", "exchanging"] } } });
    for (const attempt of pending) {
      let resultEnc: string | null = null;
      try { const binding = bindingOf(attempt); resultEnc = seal({ workspaceId: binding.workspaceId, causaId: binding.causaId }, attemptContext(attempt.ownerId, attempt.id)); } catch { /* Invalid attempts retain no private material. */ }
      await tx.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: { in: ["pending", "exchanging"] } }, data: { phase: "cancelled", resultEnc, errorCode: "configuration_changed" } });
    }
  });
  return easyOAuthSetupStatus();
}
export async function startEasyOAuth(actor: ConnectorActor, input: { workspaceId: string; provider: EasyOAuthProvider; requestId: string; confirmed: true }, origin: string, options: Options = {}) {
  if (input.confirmed !== true) throw new ConnectorError("oauth_confirmation_required", "Confirme conectar esta aplicación a su espacio.");
  const { user, workspace } = await access(actor, input.workspaceId), config = requireConfig(await configFor(input.provider, options));
  if (origin !== config.origin) throw new ConnectorError("oauth_origin_mismatch", "Abra LexOpen en la dirección de retorno preparada por su administrador.", 409);
  await noActiveSession(workspace);
  const inventory = await connectorInventory(user, workspace.id), name = easyConnectionName(actor.id, workspace.id, input.provider), spec = specifications[input.provider];
  if (!inventory.gateReady || !inventory.catalog.some(kind => kind.id === spec.kind && kind.available && kind.fields.some(field => field.name === "token" && field.secret))) throw new ConnectorError("oauth_gateway_upgrade", "Actualice el computador de ALTAZOR para habilitar esta conexión.", 409);
  const id = computerOperationHash(actor.id, "oauth-start", "request", { requestId: input.requestId });
  let binding: Binding = { workspaceId: workspace.id, workspaceBinding: workspaceBinding(workspace), configurationBinding: appBinding(actor, workspace.id, config), connectionName: name, causaId: workspace.causaId, state: randomToken(), verifier: randomToken(), nonce: randomToken() };
  const expiresAt = new Date(Date.now() + 10 * 60_000);
  const attempt = await prisma.$transaction(async tx => {
    const current = await access(actor, workspace.id, tx); await noActiveSession(current.workspace, tx);
    const locked = await tx.altazorComputerWorkspace.updateMany({ where: { id: workspace.id, ownerId: actor.id, enabled: true, credentialEnc: workspace.credentialEnc, endpoint: workspace.endpoint, providerName: workspace.providerName }, data: { updatedAt: current.workspace.updatedAt } });
    if (!locked.count || workspaceBinding(current.workspace) !== binding.workspaceBinding) throw new ConnectorError("workspace_changed", "El espacio cambió. Vuelva a iniciar la conexión.", 409);
    const previous = await tx.personalOAuthAttempt.findUnique({ where: { id } });
    if (previous) {
      if (previous.ownerId !== actor.id || previous.provider !== prefix + input.provider || previous.sessionHash !== actor.sessionHash || previous.sessionVersion !== actor.sessionVersion || previous.phase !== "pending" || previous.expiresAt.getTime() <= Date.now()) throw new ConnectorError("oauth_attempt_consumed", "Este intento ya cambió. Inicie una conexión nueva.", 409);
      const old = bindingOf(previous);
      if (old.workspaceId !== workspace.id || old.workspaceBinding !== binding.workspaceBinding || old.configurationBinding !== binding.configurationBinding) throw new ConnectorError("request_conflict", "La solicitud corresponde a otra conexión.", 409);
      binding = old; return previous;
    }
    return tx.personalOAuthAttempt.create({ data: { id, ownerId: actor.id, provider: prefix + input.provider, stateHash: digest(binding.state), sessionHash: actor.sessionHash, sessionVersion: actor.sessionVersion, nonceHash: digest(binding.nonce), requestedScopesJson: JSON.stringify(spec.scopes), redirectUri: config.redirectUri, clientId: config.clientId, resultEnc: seal(binding, attemptContext(actor.id, id)), expiresAt } });
  });
  const params = new URLSearchParams({ response_type: "code", client_id: config.clientId, redirect_uri: config.redirectUri, state: binding.state, scope: spec.scopes.join(" "), code_challenge: createHash("sha256").update(binding.verifier).digest("base64url"), code_challenge_method: "S256" });
  if (input.provider === "google") { params.set("access_type", "online"); params.set("include_granted_scopes", "false"); params.set("prompt", "consent"); }
  if (input.provider === "dropbox") params.set("token_access_type", "online");
  return { attemptId: attempt.id, provider: input.provider, authUrl: `${spec.authorize}?${params}`, expiresAt: attempt.expiresAt.toISOString() };
}
async function providerJson(url: string, init: RequestInit, fetcher: typeof fetch) {
  try {
    const response = await fetcher(url, { ...init, redirect: "error", cache: "no-store", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) throw new Error();
    const reader = response.body?.getReader(); if (!reader) throw new Error();
    const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 64 * 1024) { await reader.cancel(); throw new Error(); } chunks.push(chunk.value); } } finally { reader.releaseLock(); }
    const body: unknown = JSON.parse(Buffer.concat(chunks, size).toString("utf8"));
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch { throw new ConnectorError("oauth_provider_rejected", "El servicio no confirmó la autorización. Inicie una conexión nueva.", 502); }
}
async function verifyProviderAccount(provider: EasyOAuthProvider, headers: Record<string, string>, fetcher: typeof fetch) {
  if (provider === "dropbox") {
    const account = await providerJson("https://api.dropboxapi.com/2/users/get_current_account", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "null" }, fetcher);
    return account.account_id;
  }
  if (provider === "github") return (await providerJson("https://api.github.com/user", { headers }, fetcher)).id;
  const account = await providerJson("https://www.googleapis.com/drive/v3/about?fields=user(permissionId)", { headers }, fetcher);
  return account.user && typeof account.user === "object" ? (account.user as Record<string, unknown>).permissionId : null;
}
export async function receiveEasyOAuth(actor: ConnectorActor, input: { state: string; code?: string; denied?: boolean }, origin: string, options: Options = {}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.state)) throw new ConnectorError("invalid_state", "El intento no puede verificarse.");
  const attempt = await prisma.personalOAuthAttempt.findUnique({ where: { stateHash: digest(input.state) } });
  if (!attempt || attempt.ownerId !== actor.id || attempt.sessionVersion !== actor.sessionVersion || !constantEqual(attempt.sessionHash, actor.sessionHash) || attempt.expiresAt.getTime() <= Date.now() || !EASY_OAUTH_PROVIDERS.some(provider => attempt.provider === prefix + provider)) throw new ConnectorError("oauth_attempt_unavailable", "La conexión no pertenece a esta sesión o venció.", 404);
  if (attempt.phase !== "pending") throw new ConnectorError("oauth_attempt_consumed", "Este retorno ya se utilizó. Compruebe el estado en LexOpen.", 409);
  const provider = attempt.provider.slice(prefix.length) as EasyOAuthProvider, binding = bindingOf(attempt), config = requireConfig(await configFor(provider, options));
  const { workspace } = await access(actor, binding.workspaceId); await noActiveSession(workspace);
  if (origin !== config.origin || attempt.clientId !== config.clientId || attempt.redirectUri !== config.redirectUri || binding.configurationBinding !== appBinding(actor, workspace.id, config) || binding.workspaceBinding !== workspaceBinding(workspace) || binding.causaId !== workspace.causaId || !constantEqual(attempt.nonceHash, digest(binding.nonce))) throw new ConnectorError("oauth_binding_changed", "La configuración o el espacio cambió. Inicie una conexión nueva.", 409);
  const claimed = await prisma.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: "pending", consumedAt: null, expiresAt: { gt: new Date() }, sessionHash: actor.sessionHash, sessionVersion: actor.sessionVersion }, data: { phase: "exchanging", consumedAt: new Date() } });
  if (!claimed.count) throw new ConnectorError("oauth_attempt_consumed", "Este retorno ya se utilizó. Compruebe el estado en LexOpen.", 409);
  try {
    if (input.denied || !input.code || input.code.length > 8000) throw new ConnectorError("oauth_cancelled", "La conexión no fue autorizada.");
    const spec = specifications[provider], fetcher = options.fetcher || fetch;
    const tokens = await providerJson(spec.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body: new URLSearchParams({ grant_type: "authorization_code", client_id: config.clientId, client_secret: config.clientSecret, redirect_uri: config.redirectUri, code: input.code, code_verifier: binding.verifier }) }, fetcher);
    const { accessToken, scopes } = readOAuthTokenResponse(tokens, spec.scopes);
    const ttl = tokens.expires_in;
    if ((provider !== "github" || ttl !== undefined) && (typeof ttl !== "number" || !Number.isFinite(ttl) || ttl < 60 || ttl > 366 * 86400)) throw new ConnectorError("oauth_expiry_invalid", "El servicio no confirmó una vigencia válida.", 409);
    const expiresAt = typeof ttl === "number" ? new Date(Date.now() + ttl * 1000) : null;
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
    const subject = await verifyProviderAccount(provider, headers, fetcher);
    if ((typeof subject !== "string" && typeof subject !== "number") || !String(subject).trim() || String(subject).length > 200) throw new ConnectorError("oauth_identity_invalid", "No se pudo comprobar esta autorización de lectura.", 409);
    if (provider === "dropbox" && (typeof tokens.account_id !== "string" || !constantEqual(tokens.account_id, String(subject)))) throw new ConnectorError("oauth_identity_invalid", "Dropbox no confirmó la misma cuenta autorizada.", 409);
    const currentConfig = requireConfig(await configFor(provider, options)), current = await access(actor, workspace.id);
    if (appBinding(actor, workspace.id, currentConfig) !== binding.configurationBinding || workspaceBinding(current.workspace) !== binding.workspaceBinding) throw new ConnectorError("oauth_binding_changed", "La configuración cambió durante la autorización.", 409);
    // Lock the operator configuration and attempt through the one outbound save. A
    // setup rotation waits here; no transaction containing an RPC is ever retried.
    await prisma.$transaction(async tx => {
      const operator = await tx.integrationConfig.findUnique({ where: { provider: `altazor-oauth-${provider}` } });
      if (operator) await tx.integrationConfig.updateMany({ where: { id: operator.id, configJson: operator.configJson }, data: { updatedAt: operator.updatedAt } });
      const lockedConfig = requireConfig(await configFor(provider, options, tx));
      if (appBinding(actor, workspace.id, lockedConfig) !== binding.configurationBinding) throw new ConnectorError("oauth_binding_changed", "La aplicación cambió durante la autorización.", 409);
      const attemptLock = await tx.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: "exchanging", sessionHash: actor.sessionHash, sessionVersion: actor.sessionVersion, expiresAt: { gt: new Date() } }, data: { phase: "exchanging" } });
      if (!attemptLock.count) throw new ConnectorError("oauth_attempt_cancelled", "El intento cambió antes de guardar la conexión.", 409);
      const beforeSave = await access(actor, workspace.id, tx); await noActiveSession(beforeSave.workspace, tx);
      if (workspaceBinding(beforeSave.workspace) !== binding.workspaceBinding) throw new ConnectorError("oauth_binding_changed", "El espacio cambió durante la autorización.", 409);
      const result = await configureConnector(beforeSave.user, workspace.id, `oauth:${attempt.id}`, binding.connectionName, { kind: spec.kind, settings: { token: accessToken } }, workspace);
      if (result.operation.status !== "completed") throw new ConnectorError("oauth_save_unknown", "No se confirmó la conexión. Revise su estado antes de repetirla.", 409);
      const tested = await testConnector(beforeSave.user, workspace.id, binding.connectionName);
      if (!tested.ok || !tested.tested) throw new ConnectorError("oauth_test_failed", "La aplicación autorizó el acceso, pero ALTAZOR no pudo comprobar la conexión.", 409);
      const live = await access(actor, workspace.id, tx); await noActiveSession(live.workspace, tx);
      if (workspaceBinding(live.workspace) !== binding.workspaceBinding || appBinding(actor, workspace.id, requireConfig(await configFor(provider, options, tx))) !== binding.configurationBinding) throw new ConnectorError("oauth_binding_changed", "La configuración cambió.", 409);
      const completed = await tx.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: "exchanging", expiresAt: { gt: new Date() } }, data: { phase: "completed", completedAt: new Date(), resultEnc: seal({ workspaceId: workspace.id, causaId: workspace.causaId }, attemptContext(actor.id, attempt.id)), errorCode: null } });
      if (!completed.count) throw new ConnectorError("oauth_attempt_cancelled", "El intento cambió antes de completarse.", 409);
      const where = { ownerId_provider: { ownerId: actor.id, provider: accountProvider(workspace.id, provider) } }, previous = await tx.personalConnectorAccount.findUnique({ where }), id = previous?.id || randomUUID();
      const proof: ConnectionProof = { workspaceBinding: binding.workspaceBinding, connectionName: binding.connectionName, expiresAt: expiresAt?.toISOString() || null, scopes };
      const data = { clientId: config.clientId, externalSubject: digest(String(subject)), name: spec.label, status: "connected", grantedScopesJson: JSON.stringify(scopes), credentialsEnc: seal(proof, proofContext(actor.id, id)), expiresAt, lastVerifiedAt: new Date(), lastErrorCode: null };
      await tx.personalConnectorAccount.upsert({ where, create: { id, ownerId: actor.id, provider: accountProvider(workspace.id, provider), ...data }, update: data });
    }, { isolationLevel: "ReadCommitted", timeout: 60_000 });
    return { attemptId: attempt.id, provider, causaId: workspace.causaId };
  } catch (error) {
    await prisma.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: "exchanging" }, data: { phase: "failed", resultEnc: seal({ workspaceId: workspace.id, causaId: workspace.causaId }, attemptContext(actor.id, attempt.id)), errorCode: error instanceof ConnectorError ? error.code : "oauth_failed" } });
    return { attemptId: attempt.id, provider, causaId: workspace.causaId };
  }
}
/** Resolve a failed return only after checking its original session and current scope ACL. */
export async function easyOAuthReturnContext(actor: ConnectorActor, state: string) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new ConnectorError("invalid_state", "El intento no puede verificarse.");
  const attempt = await prisma.personalOAuthAttempt.findUnique({ where: { stateHash: digest(state) } });
  if (!attempt || attempt.ownerId !== actor.id || attempt.sessionVersion !== actor.sessionVersion || !constantEqual(attempt.sessionHash, actor.sessionHash) || !EASY_OAUTH_PROVIDERS.some(provider => attempt.provider === prefix + provider)) throw new ConnectorError("oauth_attempt_unavailable", "Intento no disponible.", 404);
  const binding = bindingOf(attempt), { workspace } = await access(actor, binding.workspaceId);
  if (workspace.causaId !== binding.causaId) throw new ConnectorError("oauth_attempt_unavailable", "Intento no disponible.", 404);
  return { attemptId: attempt.id, provider: attempt.provider.slice(prefix.length) as EasyOAuthProvider, causaId: workspace.causaId };
}
export async function failEasyOAuthReturn(actor: ConnectorActor, state: string) {
  const context = await easyOAuthReturnContext(actor, state);
  const attempt = await prisma.personalOAuthAttempt.findUniqueOrThrow({ where: { id: context.attemptId } }), binding = bindingOf(attempt);
  await prisma.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: "pending", consumedAt: null, sessionHash: actor.sessionHash, sessionVersion: actor.sessionVersion }, data: { phase: "failed", consumedAt: new Date(), resultEnc: seal({ workspaceId: binding.workspaceId, causaId: binding.causaId }, attemptContext(actor.id, attempt.id)), errorCode: "oauth_return_failed" } });
  return context;
}
export async function easyOAuthStatus(actor: ConnectorActor, workspaceId: string, attemptId?: string | null, options: Options = {}): Promise<EasyOAuthStatus> {
  const { user, workspace } = await access(actor, workspaceId), providers: EasyOAuthStatus["providers"] = [];
  let attemptView: EasyOAuthAttempt | undefined;
  if (attemptId) {
    const attempt = await prisma.personalOAuthAttempt.findFirst({ where: { id: attemptId, ownerId: actor.id, sessionHash: actor.sessionHash, sessionVersion: actor.sessionVersion, provider: { in: EASY_OAUTH_PROVIDERS.map(provider => prefix + provider) } } });
    if (!attempt) throw new ConnectorError("oauth_attempt_unavailable", "El intento no pertenece a esta sesión.", 404);
    const provider = attempt.provider.slice(prefix.length) as EasyOAuthProvider;
    if (attempt.resultEnc && bindingOf(attempt).workspaceId !== workspace.id || !attempt.resultEnc && !await prisma.altazorConnectorOperation.findFirst({ where: { ownerId: actor.id, workspaceId, requestId: `oauth:${attempt.id}` }, select: { id: true } })) throw new ConnectorError("oauth_attempt_unavailable", "El intento no pertenece a este espacio.", 404);
    const state = attempt.expiresAt.getTime() <= Date.now() && !["completed", "failed", "cancelled"].includes(attempt.phase) ? "expired" : attempt.phase;
    attemptView = { id: attempt.id, provider, state: ["pending", "exchanging", "completed", "failed", "cancelled", "expired"].includes(state) ? state as EasyOAuthAttempt["state"] : "failed", reason: attempt.phase === "failed" ? oauthFailureReason(attempt.errorCode) : state === "expired" ? "El intento venció. Inicie una conexión nueva." : null };
  }
  let inventory: Awaited<ReturnType<typeof connectorInventory>> | null = null;
  try { inventory = await connectorInventory(user, workspace.id); } catch { /* Failed inventory never becomes a stored/connected claim. */ }
  const active = await prisma.altazorComputerSession.count({ where: { ownerId: actor.id, workspaceId, state: { in: ["creating", "starting", "ready", "unknown"] } } });
  for (const provider of EASY_OAUTH_PROVIDERS) {
    const config = await configFor(provider, options), name = easyConnectionName(actor.id, workspace.id, provider), account = await prisma.personalConnectorAccount.findUnique({ where: { ownerId_provider: { ownerId: actor.id, provider: accountProvider(workspace.id, provider) } } });
    const saved = inventory?.connections.find(connection => connection.name === name && connection.kind === specifications[provider].kind);
    const dropboxReady = provider !== "dropbox" || Boolean(inventory?.gateReady && inventory.catalog.find(entry => entry.id === "dropbox")?.available);
    const hasStoredConnection = Boolean(saved), canDisconnect = hasStoredConnection && Boolean(inventory?.gateReady) && !active;
    let state: EasyOAuthStatus["providers"][number]["state"] = config.configured ? "idle" : "blocked", tested = false, reason = config.reason;
    if (config.configured && dropboxReady && account) {
      try {
        const proof = unseal<ConnectionProof>(account.credentialsEnc || "", proofContext(actor.id, account.id));
        if (account.status !== "connected" || account.clientId !== config.clientId || proof.workspaceBinding !== workspaceBinding(workspace) || proof.connectionName !== name) throw new Error();
        if (account.expiresAt && account.expiresAt.getTime() <= Date.now()) { state = "expired"; reason = "La autorización venció. Pulse Conectar para renovarla."; }
        else {
          if (!saved?.configured || saved.needsSignIn || !account.lastVerifiedAt) throw new Error();
          const liveCheck = await testConnector(user, workspace.id, name);
          if (!liveCheck.ok || !liveCheck.tested) throw new Error();
          const fresh = await access(actor, workspace.id), freshConfig = await configFor(provider, options);
          if (workspaceBinding(fresh.workspace) !== proof.workspaceBinding || !freshConfig.configured || freshConfig.clientId !== config.clientId) throw new Error();
          const checked = await prisma.personalConnectorAccount.updateMany({ where: { id: account.id, ownerId: actor.id, credentialsEnc: account.credentialsEnc, status: "connected" }, data: { lastVerifiedAt: new Date() } });
          if (!checked.count) throw new Error();
          state = "connected"; tested = true; reason = null;
        }
      } catch { state = "reconnect_required"; reason = "Compruebe el computador y vuelva a conectar esta aplicación."; }
    }
    if (attemptView?.provider === provider && ["pending", "exchanging"].includes(attemptView.state) && state !== "connected") state = "pending";
    if (config.configured && !dropboxReady) { state = "blocked"; reason = "Actualice el escritorio de Altazor para conectar Dropbox con permisos de lectura."; }
    providers.push({ provider, label: specifications[provider].label, available: config.configured && dropboxReady, reason, scopes: [...specifications[provider].scopes], connectionName: name, state, connected: state === "connected", tested: dropboxReady && tested, hasStoredConnection, canDisconnect, expiresAt: account?.expiresAt?.toISOString() || null, lastVerifiedAt: account?.lastVerifiedAt?.toISOString() || null });
  }
  return { workspaceId, causaId: workspace.causaId, canAdmin: canSome(user, "host.admin"), requiresStop: Boolean(active), providers, ...(attemptView ? { attempt: attemptView } : {}) };
}
