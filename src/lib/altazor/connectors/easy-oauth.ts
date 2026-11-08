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
import { configureConnector, configurePersistentEasyOAuth, connectorInventory, testConnector, assertPersistentOAuthImportReady } from "./service";
import { oauthFailureReason, readOAuthTokenResponse } from "./oauth-token-response";
import { requestOAuthProviderJson } from "./oauth-provider-response";
import { checkGithubApplication } from "./github-application-check";
import { canReadConnectorFiles, easyOAuthScopes, validEasyOAuthScopes, type EasyOAuthAccess } from "./oauth-access";
import { validatePersistentEasyOAuth } from "./persistent-oauth";
import { parseDistributedOAuthProfile } from "../../../../desktop/oauth-clients.cjs";
import { requestGithubDevice, pollGithubDevice } from "./github-device";
import { MICROSOFT_AUTHORIZE_URL, MICROSOFT_TOKEN_URL, microsoftNativeCallback, microsoftPublicAuthorization, microsoftPublicCodeBody, normalizeMicrosoftFileScopes } from "./microsoft-oauth";

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
  microsoft: { label: "Microsoft 365", kind: "microsoft-365", scopes: ["Files.Read", "User.Read"], authorize: MICROSOFT_AUTHORIZE_URL, token: MICROSOFT_TOKEN_URL, registrationUrl: "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade" },
} as const;
type Config = { provider: EasyOAuthProvider; clientId: string; clientSecret: string; origin: string; redirectUri: string; configured: boolean; source: "environment" | "saved" | "distributed" | "none"; reason: string | null; flow: "web" | "installed" | "device" | "public_client" };
type DeviceBinding = { code: string; userCode: string; verificationUri: string; interval: number; nextPollAt: number };
type Binding = { workspaceId: string; workspaceBinding: string; configurationBinding: string; connectionName: string; causaId: string | null; state: string; verifier: string; nonce: string; persistence?: "offline-v1"; device?: DeviceBinding; installed?: true; external?: true; authorization?: { code?: string; denied?: true } };
type ConnectionProof = { workspaceBinding: string; connectionName: string; expiresAt: string | null; scopes: string[]; autoRefresh?: boolean };
export type EasyOAuthAttempt = { id: string; provider: EasyOAuthProvider; state: "pending" | "exchanging" | "completed" | "failed" | "cancelled" | "expired"; reason: string | null; external?: boolean; device?: { userCode: string; verificationUri: string; interval: number; expiresAt: string } };
export type EasyOAuthStatus = { workspaceId: string; causaId: string | null; canAdmin: boolean; requiresStop: boolean; providers: { provider: EasyOAuthProvider; label: string; available: boolean; reason: string | null; scopes: string[]; grantedScopes: string[]; canReadFiles: boolean; autoRefresh: boolean; persistent: boolean; connectionName: string; state: "blocked" | "idle" | "pending" | "connected" | "failed" | "expired" | "reconnect_required" | "unavailable"; connected: boolean; tested: boolean; hasStoredConnection: boolean; canDisconnect: boolean; expiresAt: string | null; lastVerifiedAt: string | null }[]; attempt?: EasyOAuthAttempt };
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
  let source: Config["source"] = clientId || clientSecret ? "environment" : "none", flow: Config["flow"] = env[`ALTAZOR_${key}_PUBLIC_CLIENT`] === "1" ? "public_client" : "web";
  if (source === "none") {
    const row = await db.integrationConfig.findUnique({ where: { provider: `altazor-oauth-${provider}` } });
    if (row?.enabled) {
      source = "saved";
      try {
        const json = JSON.parse(row.configJson) as { credentialsEnc?: string };
        const saved = unseal<{ clientId: string; clientSecret: string; appUrl: string; publicClient?: boolean }>(json.credentialsEnc || "", setupContext(provider));
        clientId = saved.clientId; clientSecret = saved.clientSecret; appUrl ||= saved.appUrl; source = "saved"; flow = saved.publicClient === true ? "public_client" : "web";
      } catch { /* An unreadable operator configuration remains blocked. */ }
    }
  }
  // Only a publisher's public desktop identity may travel with installers.
  // Existing operator registrations always win; web secrets are never bundled.
  if (source === "none" && env.LEXOPEN_DESKTOP === "1" && env.ALTAZOR_DISTRIBUTED_OAUTH) {
    try {
      const profile = parseDistributedOAuthProfile(env.ALTAZOR_DISTRIBUTED_OAUTH);
      const entry = profile[provider];
      if (entry) { clientId = entry.client_id; clientSecret = entry.type === "installed" ? entry.client_secret : ""; flow = entry.type; source = "distributed"; }
    } catch { /* Invalid release identities remain unavailable. */ }
  }
  let origin = "", redirectUri = "", reason: string | null = setupReason;
  try {
    origin = validOrigin(appUrl); encryptionKey();
    const parsedOrigin = new URL(origin), publicClient = flow === "public_client";
    redirectUri = provider === "microsoft" ? microsoftNativeCallback(origin) : origin + callbackPath;
    const nativeOrigin = publicClient ? parsedOrigin.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(parsedOrigin.hostname) : source !== "distributed" || ["127.0.0.1", "[::1]"].includes(parsedOrigin.hostname);
    const validSecret = publicClient ? ["dropbox", "microsoft"].includes(provider) && clientSecret === "" : Boolean(clientSecret || flow === "device");
    const validMicrosoft = provider !== "microsoft" || publicClient && /^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(clientId);
    if (nativeOrigin && validSecret && validMicrosoft && clientId && clientId.length <= 1000 && clientSecret.length <= 4000 && !/[\r\n]/.test(clientId + clientSecret)) reason = null;
  } catch { /* Explicitly unconfigured, never use another app's identity. */ }
  return { provider, clientId, clientSecret, origin, redirectUri, configured: reason === null, source, reason, flow };
}
function requireConfig(config: Config) { if (!config.configured) throw new ConnectorError("oauth_unconfigured", setupReason, 503); return config; }
function appBinding(actor: ConnectorActor, workspaceId: string, config: Config) { return computerOperationHash(actor.id, workspaceId, "oauth-app", { clientId: config.clientId, secret: config.clientSecret, redirectUri: config.redirectUri, ...(config.flow !== "web" ? { flow: config.flow } : {}) }); }
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
  return { providers: await Promise.all(EASY_OAUTH_PROVIDERS.map(async provider => { const config = await configFor(provider, options); let fallback: string | null = null; try { if (verifiedDisplayOrigin) fallback = provider === "microsoft" ? microsoftNativeCallback(verifiedDisplayOrigin) : validOrigin(verifiedDisplayOrigin) + callbackPath; } catch { /* Unsupported native origins remain unprepared. */ } return { provider, label: specifications[provider].label, configured: config.configured, source: config.source, publicClient: config.flow === "public_client", callbackUri: config.redirectUri || fallback, canEdit: config.source !== "environment", reason: config.reason, registrationUrl: specifications[provider].registrationUrl }; })) };
}
export async function saveEasyOAuthSetup(actor: ConnectorActor, input: { provider: EasyOAuthProvider; clientId: string; clientSecret: string; publicClient?: boolean; confirmed: true }, appOrigin: string, options: Options = {}) {
  const user = await nativeOAuthActor(actor);
  if (!canSome(user, "host.admin")) throw new ConnectorError("forbidden", "Sólo el administrador puede preparar las conexiones del Host.", 403);
  const config = await configFor(input.provider);
  if (config.source === "environment") throw new ConnectorError("oauth_managed_environment", "Esta conexión ya está administrada por la configuración del Host.", 409);
  const publicClient = input.publicClient === true;
  if (input.confirmed !== true || !input.clientId.trim() || (publicClient ? !["dropbox", "microsoft"].includes(input.provider) || input.clientSecret !== "" : !input.clientSecret.trim() || input.provider === "microsoft") || input.clientId.length > 1000 || input.clientSecret.length > 4000 || /[\r\n]/.test(input.clientId + input.clientSecret)) throw new ConnectorError("oauth_setup_invalid", "Complete los datos de la aplicación registrada.");
  const appUrl = validOrigin(appOrigin);
  if (publicClient && (new URL(appUrl).protocol !== "http:" || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(appUrl).hostname))) throw new ConnectorError("oauth_setup_invalid", "Prepare esta aplicación pública desde LexOpen en su equipo local.", 409);
  if (input.provider === "microsoft") { microsoftNativeCallback(appUrl); if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(input.clientId)) throw new ConnectorError("oauth_setup_invalid", "Revise el identificador de la aplicación de Microsoft.", 409); }
  const credentialsEnc = seal({ clientId: input.clientId.trim(), clientSecret: input.clientSecret.trim(), appUrl, ...(publicClient ? { publicClient: true } : {}) }, setupContext(input.provider));
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
export async function startEasyOAuth(actor: ConnectorActor, input: { workspaceId: string; provider: EasyOAuthProvider; access?: EasyOAuthAccess; external?: boolean; requestId: string; confirmed: true }, origin: string, options: Options = {}) {
  let requestedScopes: string[];
  try { requestedScopes = easyOAuthScopes(input.provider, input.access); } catch { throw new ConnectorError("oauth_access_invalid", "Esta aplicación no admite el permiso solicitado.", 400); }
  if (input.confirmed !== true) throw new ConnectorError("oauth_confirmation_required", "Confirme conectar esta aplicación a su espacio.");
  const { user, workspace } = await access(actor, input.workspaceId), config = requireConfig(await configFor(input.provider, options));
  if (origin !== config.origin) throw new ConnectorError("oauth_origin_mismatch", "Abra LexOpen en la dirección de retorno preparada por su administrador.", 409);
  await noActiveSession(workspace);
  const inventory = await connectorInventory(user, workspace.id), name = easyConnectionName(actor.id, workspace.id, input.provider), spec = specifications[input.provider];
  if (!inventory.gateReady || !inventory.catalog.some(kind => kind.id === spec.kind && kind.available && kind.fields.some(field => field.name === "token" && field.secret))) throw new ConnectorError("oauth_gateway_upgrade", "Actualice el computador de ALTAZOR para habilitar esta conexión.", 409);
  const persistence = input.provider === "github" ? undefined : "offline-v1";
  if (persistence && !inventory.persistentOAuthReady) throw new ConnectorError("oauth_persistence_required", "Actualice el escritorio de Altazor para mantener sus conexiones sin iniciar sesión repetidamente.", 409);
  if (config.flow === "public_client" && !inventory.cloudFileOAuthReady) throw new ConnectorError("oauth_cloud_files_required", "Actualice el escritorio de Altazor para conectar esta cuenta pública con lectura y renovación seguras.", 409);
  await assertPersistentOAuthImportReady(user, workspace.id, name, spec.kind);
  const id = computerOperationHash(actor.id, "oauth-start", "request", { requestId: input.requestId });
  let binding: Binding = { workspaceId: workspace.id, workspaceBinding: workspaceBinding(workspace), configurationBinding: appBinding(actor, workspace.id, config), connectionName: name, causaId: workspace.causaId, state: randomToken(), verifier: randomToken(), nonce: randomToken(), ...(persistence ? { persistence } : {}), ...(config.flow === "installed" ? { installed: true as const } : {}), ...(config.flow !== "device" && (input.external || config.flow === "installed" || config.flow === "public_client") ? { external: true as const } : {}) };
  let expiresAt = new Date(Date.now() + 10 * 60_000);
  if (config.flow === "device" && !await prisma.personalOAuthAttempt.findUnique({ where: { id }, select: { id: true } })) {
    const device = await requestGithubDevice(config.clientId, requestedScopes, options.fetcher);
    binding.device = { code: device.deviceCode, userCode: device.userCode, verificationUri: device.verificationUri, interval: device.interval, nextPollAt: Date.now() + device.interval * 1000 };
    expiresAt = new Date(Date.now() + Math.min(device.expiresIn, 600) * 1000);
  }
  const attempt = await prisma.$transaction(async tx => {
    const current = await access(actor, workspace.id, tx); await noActiveSession(current.workspace, tx);
    const locked = await tx.altazorComputerWorkspace.updateMany({ where: { id: workspace.id, ownerId: actor.id, enabled: true, credentialEnc: workspace.credentialEnc, endpoint: workspace.endpoint, providerName: workspace.providerName }, data: { updatedAt: current.workspace.updatedAt } });
    if (!locked.count || workspaceBinding(current.workspace) !== binding.workspaceBinding) throw new ConnectorError("workspace_changed", "El espacio cambió. Vuelva a iniciar la conexión.", 409);
    const previous = await tx.personalOAuthAttempt.findUnique({ where: { id } });
    if (previous) {
      if (previous.ownerId !== actor.id || previous.provider !== prefix + input.provider || previous.sessionHash !== actor.sessionHash || previous.sessionVersion !== actor.sessionVersion || previous.phase !== "pending" || previous.expiresAt.getTime() <= Date.now()) throw new ConnectorError("oauth_attempt_consumed", "Este intento ya cambió. Inicie una conexión nueva.", 409);
      const old = bindingOf(previous);
      if (old.workspaceId !== workspace.id || old.workspaceBinding !== binding.workspaceBinding || old.configurationBinding !== binding.configurationBinding || old.persistence !== persistence || old.installed !== binding.installed || old.external !== binding.external || Boolean(old.device) !== (config.flow === "device") || JSON.stringify(JSON.parse(previous.requestedScopesJson)) !== JSON.stringify(requestedScopes)) throw new ConnectorError("request_conflict", "La solicitud corresponde a otra conexión.", 409);
      binding = old; return previous;
    }
    return tx.personalOAuthAttempt.create({ data: { id, ownerId: actor.id, provider: prefix + input.provider, stateHash: digest(binding.state), sessionHash: actor.sessionHash, sessionVersion: actor.sessionVersion, nonceHash: digest(binding.nonce), requestedScopesJson: JSON.stringify(requestedScopes), redirectUri: config.redirectUri, clientId: config.clientId, resultEnc: seal(binding, attemptContext(actor.id, id)), expiresAt } });
  });
  if (binding.device) return { attemptId: attempt.id, provider: input.provider, flow: "device" as const, authUrl: binding.device.verificationUri, device: { userCode: binding.device.userCode, verificationUri: binding.device.verificationUri, interval: binding.device.interval, expiresAt: attempt.expiresAt.toISOString() }, expiresAt: attempt.expiresAt.toISOString() };
  if (input.provider === "microsoft") return { attemptId: attempt.id, provider: input.provider, flow: "external" as const, authUrl: microsoftPublicAuthorization({ clientId: config.clientId, redirectUri: config.redirectUri, state: binding.state, verifier: binding.verifier }), expiresAt: attempt.expiresAt.toISOString() };
  const params = new URLSearchParams({ response_type: "code", client_id: config.clientId, redirect_uri: config.redirectUri, state: binding.state, scope: requestedScopes.join(" "), code_challenge: createHash("sha256").update(binding.verifier).digest("base64url"), code_challenge_method: "S256" });
  if (input.provider === "google") { params.set("access_type", "offline"); params.set("include_granted_scopes", "false"); params.set("prompt", "consent"); }
  if (input.provider === "dropbox") params.set("token_access_type", "offline");
  return { attemptId: attempt.id, provider: input.provider, flow: binding.external ? "external" as const : "redirect" as const, authUrl: `${spec.authorize}?${params}`, expiresAt: attempt.expiresAt.toISOString() };
}
async function verifyProviderAccount(provider: EasyOAuthProvider, headers: Record<string, string>, fetcher: typeof fetch) {
  if (provider === "dropbox") {
    const account = await requestOAuthProviderJson("account", "https://api.dropboxapi.com/2/users/get_current_account", { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: "null" }, fetcher);
    return account.account_id;
  }
  if (provider === "github") return (await requestOAuthProviderJson("account", "https://api.github.com/user", { headers }, fetcher)).id;
  if (provider === "microsoft") return (await requestOAuthProviderJson("account", "https://graph.microsoft.com/v1.0/me?$select=id", { headers }, fetcher)).id;
  const account = await requestOAuthProviderJson("account", "https://www.googleapis.com/drive/v3/about?fields=user(permissionId)", { headers }, fetcher);
  return account.user && typeof account.user === "object" ? (account.user as Record<string, unknown>).permissionId : null;
}
export async function receiveEasyOAuth(actor: ConnectorActor, input: { state: string; code?: string; denied?: boolean }, origin: string, options: Options = {}) {
  return receiveAuthorizedEasyOAuth(actor, input, origin, options);
}
/** A system browser has no Electron cookie. Capture its PKCE response, never a
 * grant, until the initiating authenticated application session claims it. */
export async function captureExternalOAuthReturn(input: { state: string; code?: string; denied?: boolean }, origin: string, options: Options = {}) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.state)) return false;
  const attempt = await prisma.personalOAuthAttempt.findUnique({ where: { stateHash: digest(input.state) } });
  if (!attempt || !EASY_OAUTH_PROVIDERS.some(provider => attempt.provider === prefix + provider) || attempt.phase !== "pending" || attempt.expiresAt.getTime() <= Date.now()) return false;
  const provider = attempt.provider.slice(prefix.length) as EasyOAuthProvider, binding = bindingOf(attempt), config = requireConfig(await configFor(provider, options));
  if (!(binding.external || binding.installed) || config.flow === "device" || Boolean(binding.installed) !== (config.flow === "installed")) return false;
  const actor = { id: attempt.ownerId, sessionHash: attempt.sessionHash, sessionVersion: attempt.sessionVersion };
  const { workspace } = await access(actor, binding.workspaceId); await noActiveSession(workspace);
  if (origin !== new URL(config.redirectUri).origin || attempt.clientId !== config.clientId || attempt.redirectUri !== config.redirectUri || binding.configurationBinding !== appBinding(actor, workspace.id, config) || binding.workspaceBinding !== workspaceBinding(workspace) || binding.causaId !== workspace.causaId || !constantEqual(attempt.nonceHash, digest(binding.nonce))) throw new ConnectorError("oauth_binding_changed", "La conexión cambió. Vuelva a LexOpen.", 409);
  if (!input.denied && (!input.code || input.code.length > 8000 || /[\x00-\x1f\x7f]/.test(input.code))) throw new ConnectorError("oauth_code_rejected", "No se recibió una autorización válida.", 409);
  if (binding.authorization) return true;
  binding.authorization = input.denied ? { denied: true } : { code: input.code };
  await prisma.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: "pending", consumedAt: null, resultEnc: attempt.resultEnc, expiresAt: { gt: new Date() } }, data: { resultEnc: seal(binding, attemptContext(actor.id, attempt.id)) } });
  return true;
}
export const captureInstalledOAuthReturn = captureExternalOAuthReturn;
async function receiveAuthorizedEasyOAuth(actor: ConnectorActor, input: { state: string; code?: string; denied?: boolean }, origin: string, options: Options, deviceTokens?: Record<string, unknown>) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(input.state)) throw new ConnectorError("invalid_state", "El intento no puede verificarse.");
  const attempt = await prisma.personalOAuthAttempt.findUnique({ where: { stateHash: digest(input.state) } });
  if (!attempt || attempt.ownerId !== actor.id || attempt.sessionVersion !== actor.sessionVersion || !constantEqual(attempt.sessionHash, actor.sessionHash) || attempt.expiresAt.getTime() <= Date.now() || !EASY_OAUTH_PROVIDERS.some(provider => attempt.provider === prefix + provider)) throw new ConnectorError("oauth_attempt_unavailable", "La conexión no pertenece a esta sesión o venció.", 404);
  if (attempt.phase !== (deviceTokens ? "exchanging" : "pending")) throw new ConnectorError("oauth_attempt_consumed", "Este retorno ya se utilizó. Compruebe el estado en LexOpen.", 409);
  const provider = attempt.provider.slice(prefix.length) as EasyOAuthProvider, binding = bindingOf(attempt), config = requireConfig(await configFor(provider, options));
  const { workspace } = await access(actor, binding.workspaceId); await noActiveSession(workspace);
  if (Boolean(deviceTokens) !== Boolean(binding.device) || Boolean(binding.device) !== (config.flow === "device") || Boolean(binding.installed) !== (config.flow === "installed") || (binding.external || binding.installed) && (!binding.authorization || input.code !== binding.authorization.code || Boolean(input.denied) !== Boolean(binding.authorization.denied))) throw new ConnectorError("oauth_flow_mismatch", "Complete el ingreso desde la conexión que abrió en LexOpen.", 409);
  if (origin !== config.origin || attempt.clientId !== config.clientId || attempt.redirectUri !== config.redirectUri || binding.configurationBinding !== appBinding(actor, workspace.id, config) || binding.workspaceBinding !== workspaceBinding(workspace) || binding.causaId !== workspace.causaId || !constantEqual(attempt.nonceHash, digest(binding.nonce))) throw new ConnectorError("oauth_binding_changed", "La configuración o el espacio cambió. Inicie una conexión nueva.", 409);
  if (!deviceTokens) {
    const claimed = await prisma.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: "pending", consumedAt: null, expiresAt: { gt: new Date() }, sessionHash: actor.sessionHash, sessionVersion: actor.sessionVersion }, data: { phase: "exchanging", consumedAt: new Date() } });
    if (!claimed.count) throw new ConnectorError("oauth_attempt_consumed", "Este retorno ya se utilizó. Compruebe el estado en LexOpen.", 409);
  }
  try {
    if (input.denied || !deviceTokens && (!input.code || input.code.length > 8000)) throw new ConnectorError("oauth_cancelled", "La conexión no fue autorizada.");
    if (provider !== "github" && binding.persistence !== "offline-v1") throw new ConnectorError("oauth_attempt_outdated", "Este ingreso pertenece a una conexión temporal anterior. Inicie una conexión nueva para mantenerla guardada.", 409);
    const spec = specifications[provider], fetcher = options.fetcher || fetch;
    const requestedScopes: unknown = JSON.parse(attempt.requestedScopesJson);
    if (!validEasyOAuthScopes(provider, requestedScopes)) throw new ConnectorError("oauth_scope_mismatch", "Los permisos de este intento no son válidos.", 409);
    const body = provider === "microsoft" ? microsoftPublicCodeBody({ clientId: config.clientId, redirectUri: config.redirectUri, code: input.code!, verifier: binding.verifier }) : new URLSearchParams({ grant_type: "authorization_code", client_id: config.clientId, ...(config.flow !== "public_client" ? { client_secret: config.clientSecret } : {}), redirect_uri: config.redirectUri, code: input.code!, code_verifier: binding.verifier });
    const tokens = deviceTokens || await requestOAuthProviderJson("token", spec.token, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body }, fetcher);
    let tokenResponse = tokens;
    if (provider === "microsoft" && tokens.error === undefined) { try { tokenResponse = { ...tokens, scope: normalizeMicrosoftFileScopes(tokens.scope).join(" ") }; } catch { throw new ConnectorError("oauth_scope_mismatch", oauthFailureReason("oauth_scope_mismatch"), 409); } }
    const { accessToken, scopes } = readOAuthTokenResponse(tokenResponse, requestedScopes);
    const ttl = tokens.expires_in;
    const githubExpiring = provider === "github" && (ttl !== undefined || tokens.refresh_token !== undefined || tokens.refresh_token_expires_in !== undefined);
    if ((provider !== "github" || githubExpiring) && (typeof ttl !== "number" || !Number.isInteger(ttl) || ttl < 60 || ttl > 366 * 86400)) throw new ConnectorError("oauth_expiry_invalid", "El servicio no confirmó una vigencia válida.", 409);
    if (provider === "github" && tokens.refresh_token_expires_in !== undefined && (typeof tokens.refresh_token_expires_in !== "number" || !Number.isInteger(tokens.refresh_token_expires_in) || tokens.refresh_token_expires_in <= 0 || tokens.refresh_token_expires_in > 366 * 86400)) throw new ConnectorError("oauth_expiry_invalid", "El servicio no confirmó una vigencia válida.", 409);
    const expiresAt = typeof ttl === "number" ? new Date(Date.now() + ttl * 1000) : null;
    if ((provider !== "github" || githubExpiring) && (typeof tokens.refresh_token !== "string" || !tokens.refresh_token.trim())) throw new ConnectorError("oauth_refresh_missing", "El servicio no autorizó mantener la conexión. Vuelva a conectar su cuenta y complete el consentimiento.", 409);
    const persistentInput = provider !== "github" || githubExpiring ? validatePersistentEasyOAuth({ kind: specifications[provider].kind, clientId: config.clientId, clientSecret: config.clientSecret, ...(config.flow === "public_client" || provider === "github" && config.flow === "device" ? { publicClient: true } : {}), accessToken, refreshToken: tokens.refresh_token as string, expiresAt: expiresAt!.toISOString(), scopes }) : null;
    const headers = { Authorization: `Bearer ${accessToken}`, Accept: "application/json" };
    const subject = await verifyProviderAccount(provider, headers, fetcher);
    if ((typeof subject !== "string" && typeof subject !== "number") || !String(subject).trim() || String(subject).length > 200) throw new ConnectorError("oauth_identity_invalid", "No se pudo comprobar esta autorización de lectura.", 409);
    if (provider === "dropbox" && (typeof tokens.account_id !== "string" || !constantEqual(tokens.account_id, String(subject)))) throw new ConnectorError("oauth_identity_invalid", "Dropbox no confirmó la misma cuenta autorizada.", 409);
    const currentConfig = requireConfig(await configFor(provider, options)), current = await access(actor, workspace.id);
    if (appBinding(actor, workspace.id, currentConfig) !== binding.configurationBinding || workspaceBinding(current.workspace) !== binding.workspaceBinding) throw new ConnectorError("oauth_binding_changed", "La configuración cambió durante la autorización.", 409);
    // Lock the operator configuration and attempt through the one outbound save. A
    // setup rotation waits here; no transaction containing an RPC is ever retried.
    const savedAccount = await prisma.$transaction(async tx => {
      const operator = await tx.integrationConfig.findUnique({ where: { provider: `altazor-oauth-${provider}` } });
      if (operator) await tx.integrationConfig.updateMany({ where: { id: operator.id, configJson: operator.configJson }, data: { updatedAt: operator.updatedAt } });
      const lockedConfig = requireConfig(await configFor(provider, options, tx));
      if (appBinding(actor, workspace.id, lockedConfig) !== binding.configurationBinding) throw new ConnectorError("oauth_binding_changed", "La aplicación cambió durante la autorización.", 409);
      const attemptLock = await tx.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: "exchanging", sessionHash: actor.sessionHash, sessionVersion: actor.sessionVersion, expiresAt: { gt: new Date() } }, data: { phase: "exchanging" } });
      if (!attemptLock.count) throw new ConnectorError("oauth_attempt_cancelled", "El intento cambió antes de guardar la conexión.", 409);
      const beforeSave = await access(actor, workspace.id, tx); await noActiveSession(beforeSave.workspace, tx);
      if (workspaceBinding(beforeSave.workspace) !== binding.workspaceBinding) throw new ConnectorError("oauth_binding_changed", "El espacio cambió durante la autorización.", 409);
      const result = persistentInput
        ? await configurePersistentEasyOAuth(beforeSave.user, workspace.id, `oauth:${attempt.id}`, binding.connectionName, { ...persistentInput, account: String(subject) }, workspace)
        : await configureConnector(beforeSave.user, workspace.id, `oauth:${attempt.id}`, binding.connectionName, { kind: spec.kind, settings: { token: accessToken }, ...(provider === "github" ? { clear: ["sign_in"] } : {}) }, workspace);
      if (result.operation.status !== "completed") throw new ConnectorError("oauth_save_unknown", "No se confirmó la conexión. Revise su estado antes de repetirla.", 409);
      const live = await access(actor, workspace.id, tx); await noActiveSession(live.workspace, tx);
      if (workspaceBinding(live.workspace) !== binding.workspaceBinding || appBinding(actor, workspace.id, requireConfig(await configFor(provider, options, tx))) !== binding.configurationBinding) throw new ConnectorError("oauth_binding_changed", "La configuración cambió.", 409);
      const completed = await tx.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: "exchanging", expiresAt: { gt: new Date() } }, data: { phase: "completed", completedAt: new Date(), resultEnc: seal({ workspaceId: workspace.id, causaId: workspace.causaId }, attemptContext(actor.id, attempt.id)), errorCode: null } });
      if (!completed.count) throw new ConnectorError("oauth_attempt_cancelled", "El intento cambió antes de completarse.", 409);
      const where = { ownerId_provider: { ownerId: actor.id, provider: accountProvider(workspace.id, provider) } }, previous = await tx.personalConnectorAccount.findUnique({ where }), id = previous?.id || randomUUID();
      const connectionExpiresAt = persistentInput ? null : expiresAt;
      const proof: ConnectionProof = { workspaceBinding: binding.workspaceBinding, connectionName: binding.connectionName, expiresAt: connectionExpiresAt?.toISOString() || null, scopes, autoRefresh: Boolean(persistentInput) };
      const data = { clientId: config.clientId, externalSubject: digest(String(subject)), name: spec.label, status: "connected", grantedScopesJson: JSON.stringify(scopes), credentialsEnc: seal(proof, proofContext(actor.id, id)), expiresAt: connectionExpiresAt, lastVerifiedAt: null, lastErrorCode: "oauth_unavailable" };
      return tx.personalConnectorAccount.upsert({ where, create: { id, ownerId: actor.id, provider: accountProvider(workspace.id, provider), ...data }, update: data });
    }, { isolationLevel: "ReadCommitted", timeout: 60_000 });
    // The imported grant and consumed attempt have committed before any remote
    // first check. A slow/offline provider cannot roll them back. Updates are
    // guarded by the exact saved proof so a concurrent reconfiguration wins.
    try {
      const beforeCheck = await access(actor, workspace.id), beforeConfig = requireConfig(await configFor(provider, options));
      if (workspaceBinding(beforeCheck.workspace) !== binding.workspaceBinding || appBinding(actor, workspace.id, beforeConfig) !== binding.configurationBinding) throw new Error();
      const tested = await testConnector(beforeCheck.user, workspace.id, binding.connectionName);
      const afterCheck = await access(actor, workspace.id), afterConfig = requireConfig(await configFor(provider, options));
      if (workspaceBinding(afterCheck.workspace) !== binding.workspaceBinding || appBinding(actor, workspace.id, afterConfig) !== binding.configurationBinding) throw new Error();
      const verified = tested.ok && tested.tested;
      await prisma.personalConnectorAccount.updateMany({ where: { id: savedAccount.id, ownerId: actor.id, clientId: savedAccount.clientId, credentialsEnc: savedAccount.credentialsEnc, status: "connected" }, data: { lastVerifiedAt: verified ? new Date() : null, lastErrorCode: verified ? null : tested.code || "oauth_unavailable" } });
    } catch { /* A later read-only status check can verify the same saved grant. */ }
    return { attemptId: attempt.id, provider, causaId: workspace.causaId };
  } catch (error) {
    await prisma.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: "exchanging" }, data: { phase: "failed", resultEnc: seal({ workspaceId: workspace.id, causaId: workspace.causaId }, attemptContext(actor.id, attempt.id)), errorCode: error instanceof ConnectorError ? error.code : "oauth_failed" } });
    return { attemptId: attempt.id, provider, causaId: workspace.causaId };
  }
}
export async function continueEasyOAuth(actor: ConnectorActor, attemptId: string, origin: string, options: Options = {}) {
  const attempt = await prisma.personalOAuthAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.ownerId !== actor.id || attempt.sessionVersion !== actor.sessionVersion || !constantEqual(attempt.sessionHash, actor.sessionHash)) throw new ConnectorError("oauth_attempt_unavailable", "El ingreso no pertenece a esta sesión.", 404);
  const provider = attempt.provider.slice(prefix.length) as EasyOAuthProvider;
  if (!EASY_OAUTH_PROVIDERS.includes(provider)) throw new ConnectorError("oauth_attempt_unavailable", "Ingreso no disponible.", 404);
  const binding = bindingOf(attempt);
  if (binding.device) return pollEasyOAuthDevice(actor, attemptId, origin, options);
  const { workspace } = await access(actor, binding.workspaceId), config = requireConfig(await configFor(provider, options));
  await noActiveSession(workspace);
  if (!(binding.external || binding.installed) || config.flow === "device" || Boolean(binding.installed) !== (config.flow === "installed") || origin !== config.origin || binding.configurationBinding !== appBinding(actor, workspace.id, config) || binding.workspaceBinding !== workspaceBinding(workspace)) throw new ConnectorError("oauth_binding_changed", "La conexión cambió. Vuelva a conectar su cuenta.", 409);
  if (attempt.expiresAt.getTime() <= Date.now()) throw new ConnectorError("oauth_attempt_expired", "El ingreso venció. Puede volver a conectar su cuenta.", 409);
  if (attempt.phase !== "pending" || !binding.authorization) return { state: attempt.phase, retryAfter: 5 };
  await receiveAuthorizedEasyOAuth(actor, { state: binding.state, ...binding.authorization }, origin, options);
  const finished = await prisma.personalOAuthAttempt.findUnique({ where: { id: attempt.id }, select: { phase: true } });
  return { state: finished?.phase || "failed", retryAfter: 5 };
}
/** Device codes stay encrypted on the Host; only this session may poll them. */
export async function pollEasyOAuthDevice(actor: ConnectorActor, attemptId: string, origin: string, options: Options = {}) {
  const attempt = await prisma.personalOAuthAttempt.findUnique({ where: { id: attemptId } });
  if (!attempt || attempt.ownerId !== actor.id || attempt.provider !== prefix + "github" || attempt.sessionVersion !== actor.sessionVersion || !constantEqual(attempt.sessionHash, actor.sessionHash)) throw new ConnectorError("oauth_attempt_unavailable", "El ingreso no pertenece a esta sesión.", 404);
  const binding = bindingOf(attempt), { workspace } = await access(actor, binding.workspaceId), config = requireConfig(await configFor("github", options));
  await noActiveSession(workspace);
  if (config.flow !== "device" || !binding.device || origin !== config.origin || attempt.clientId !== config.clientId || binding.configurationBinding !== appBinding(actor, workspace.id, config) || binding.workspaceBinding !== workspaceBinding(workspace) || binding.causaId !== workspace.causaId || !constantEqual(attempt.nonceHash, digest(binding.nonce))) throw new ConnectorError("oauth_binding_changed", "La conexión cambió. Inicie el ingreso de nuevo.", 409);
  if (attempt.expiresAt.getTime() <= Date.now()) throw new ConnectorError("oauth_attempt_expired", "El ingreso venció. Puede volver a conectar GitHub.", 409);
  if (attempt.phase !== "pending" || binding.device.nextPollAt > Date.now()) return { state: attempt.phase, retryAfter: binding.device.interval };
  const claimed = await prisma.personalOAuthAttempt.updateMany({ where: { id: attempt.id, ownerId: actor.id, resultEnc: attempt.resultEnc, phase: "pending", consumedAt: null, expiresAt: { gt: new Date() } }, data: { phase: "exchanging", consumedAt: new Date() } });
  if (!claimed.count) return { state: "exchanging", retryAfter: binding.device.interval };
  try {
    const result = await pollGithubDevice(config.clientId, binding.device.code, options.fetcher);
    if (result.state === "authorized") {
      // The same identity/scope checks, single-use save and gateway confirmation
      // used by browser callbacks apply to device authorizations as well.
      await receiveAuthorizedEasyOAuth(actor, { state: binding.state }, origin, options, result.tokenResponse);
      const finished = await prisma.personalOAuthAttempt.findUnique({ where: { id: attempt.id }, select: { phase: true } });
      return { state: finished?.phase || "failed", retryAfter: binding.device.interval };
    }
    if (result.state === "pending" || result.state === "slow_down") {
      if (result.state === "slow_down") binding.device.interval = Math.min(300, binding.device.interval + 5);
      binding.device.nextPollAt = Date.now() + binding.device.interval * 1000;
      await prisma.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: "exchanging", resultEnc: attempt.resultEnc }, data: { phase: "pending", consumedAt: null, resultEnc: seal(binding, attemptContext(actor.id, attempt.id)) } });
      return { state: "pending", retryAfter: binding.device.interval };
    }
    throw new ConnectorError(result.state === "denied" ? "oauth_cancelled" : "oauth_attempt_expired", result.state === "denied" ? "No autorizó la conexión con GitHub." : "El ingreso venció. Puede volver a conectar GitHub.", 409);
  } catch (error) {
    await prisma.personalOAuthAttempt.updateMany({ where: { id: attempt.id, phase: "exchanging", resultEnc: attempt.resultEnc }, data: { phase: "failed", resultEnc: seal({ workspaceId: workspace.id, causaId: workspace.causaId }, attemptContext(actor.id, attempt.id)), errorCode: error instanceof ConnectorError ? error.code : "oauth_failed" } });
    throw error;
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
    if (state === "pending" || state === "exchanging") {
      const device = bindingOf(attempt).device;
      if (device) attemptView.device = { userCode: device.userCode, verificationUri: device.verificationUri, interval: device.interval, expiresAt: attempt.expiresAt.toISOString() };
      if (bindingOf(attempt).installed || bindingOf(attempt).external) attemptView.external = true;
    }
  }
  let inventory: Awaited<ReturnType<typeof connectorInventory>> | null = null;
  try { inventory = await connectorInventory(user, workspace.id); } catch { /* Failed inventory never becomes a stored/connected claim. */ }
  const active = await prisma.altazorComputerSession.count({ where: { ownerId: actor.id, workspaceId, state: { in: ["creating", "starting", "ready", "unknown"] } } });
  for (const provider of EASY_OAUTH_PROVIDERS) {
    const config = await configFor(provider, options), name = easyConnectionName(actor.id, workspace.id, provider), account = await prisma.personalConnectorAccount.findUnique({ where: { ownerId_provider: { ownerId: actor.id, provider: accountProvider(workspace.id, provider) } } });
    const saved = inventory?.connections.find(connection => connection.name === name && connection.kind === specifications[provider].kind);
    const dropboxReady = provider !== "dropbox" || Boolean(inventory?.gateReady && inventory.catalog.find(entry => entry.id === "dropbox")?.available);
    const cloudReady = config.flow !== "public_client" || inventory?.cloudFileOAuthReady === true;
    const hasStoredConnection = Boolean(saved), canDisconnect = hasStoredConnection && Boolean(inventory?.gateReady) && !active;
    let state: EasyOAuthStatus["providers"][number]["state"] = config.configured ? "idle" : "blocked", tested = false, reason = config.reason;
    let grantedScopes: string[] = [], autoRefresh = false, persistent = false, proofValid = false;
    if (config.configured && dropboxReady && cloudReady && account) {
      try {
        const proof = unseal<ConnectionProof>(account.credentialsEnc || "", proofContext(actor.id, account.id));
        if (account.status !== "connected" || account.clientId !== config.clientId || proof.workspaceBinding !== workspaceBinding(workspace) || proof.connectionName !== name || !validEasyOAuthScopes(provider, proof.scopes) || JSON.stringify(proof.scopes) !== account.grantedScopesJson) throw new Error();
        proofValid = true; autoRefresh = proof.autoRefresh === true;
        persistent = autoRefresh || provider === "github" && account.expiresAt === null;
        grantedScopes = proof.scopes;
        if (!autoRefresh && account.expiresAt && account.expiresAt.getTime() <= Date.now()) { state = "expired"; reason = "La autorización temporal venció. Conecte su cuenta una vez más para mantenerla guardada."; }
        else {
          if (!inventory || autoRefresh && (!inventory.persistentOAuthReady || provider === "github" && !inventory.githubPersistentOAuthReady)) throw new ConnectorError("oauth_unavailable", "No pudimos comprobar el escritorio que guarda esta conexión.", 503);
          if (!saved?.configured || saved.needsSignIn) throw new ConnectorError("oauth_reconnect_required", "La conexión guardada necesita autorización de su cuenta.", 409);
          const liveCheck = await testConnector(user, workspace.id, name);
          if (!liveCheck.ok || !liveCheck.tested) throw new ConnectorError(liveCheck.code === "oauth_reconnect_required" ? "oauth_reconnect_required" : "oauth_unavailable", "No se pudo comprobar el acceso a esta aplicación.", 409);
          const fresh = await access(actor, workspace.id), freshConfig = await configFor(provider, options);
          if (workspaceBinding(fresh.workspace) !== proof.workspaceBinding || !freshConfig.configured || freshConfig.clientId !== config.clientId) throw new Error();
          const checked = await prisma.personalConnectorAccount.updateMany({ where: { id: account.id, ownerId: actor.id, credentialsEnc: account.credentialsEnc, status: "connected" }, data: { lastVerifiedAt: new Date() } });
          if (!checked.count) throw new Error();
          state = "connected"; tested = true; reason = null; grantedScopes = proof.scopes;
        }
      } catch (error) {
        grantedScopes = [];
        const revoked = error instanceof ConnectorError && error.code === "oauth_reconnect_required";
        state = proofValid && !revoked ? "unavailable" : "reconnect_required";
        reason = state === "unavailable" ? "La conexión sigue guardada. No pudimos comprobar el acceso en este momento; vuelva a comprobarlo sin iniciar sesión de nuevo." : "El servicio necesita que vuelva a autorizar esta conexión. Sus archivos y conversaciones se conservan.";
      }
    }
    if (attemptView?.provider === provider && ["pending", "exchanging"].includes(attemptView.state) && state !== "connected") state = "pending";
    if (config.configured && !dropboxReady) { state = "blocked"; reason = "Actualice el escritorio de Altazor para conectar Dropbox con permisos de lectura."; }
    if (config.configured && !cloudReady) { state = "blocked"; reason = "Actualice el escritorio de Altazor para conectar esta cuenta pública con lectura y renovación seguras."; }
    providers.push({ provider, label: specifications[provider].label, available: config.configured && dropboxReady && cloudReady, reason, scopes: [...specifications[provider].scopes], grantedScopes, canReadFiles: tested && canReadConnectorFiles(provider, grantedScopes), autoRefresh, persistent, connectionName: name, state, connected: state === "connected", tested: dropboxReady && cloudReady && tested, hasStoredConnection, canDisconnect, expiresAt: autoRefresh ? null : account?.expiresAt?.toISOString() || null, lastVerifiedAt: account?.lastVerifiedAt?.toISOString() || null });
  }
  return { workspaceId, causaId: workspace.causaId, canAdmin: canSome(user, "host.admin"), requiresStop: Boolean(active), providers, ...(attemptView ? { attempt: attemptView } : {}) };
}
