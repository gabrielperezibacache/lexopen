/** Owned disposable PostgreSQL plus fake official HTTP endpoints; no real accounts. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { digest, seal, unseal } from "@/lib/personal-connectors/core";
import { configureComputer } from "../computer/service";
import { beginConnectorOAuth, configureConnector, removeConnector } from "./service";
import { CONNECTOR_CATALOG } from "./catalog";
import { easyConnectionName, easyOAuthReturnContext, failEasyOAuthReturn, easyOAuthSetupStatus, easyOAuthStatus, receiveEasyOAuth, captureInstalledOAuthReturn, continueEasyOAuth, pollEasyOAuthDevice, saveEasyOAuthSetup, startEasyOAuth, EASY_OAUTH_PROVIDERS, type EasyOAuthProvider } from "./easy-oauth";

const denied = (status: number) => (error: unknown) => (error as { status?: number }).status === status;
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  process.env.ALTAZOR_COMPUTER_ENABLED = "1";
  const stamp = randomUUID(), userIds: string[] = [], caseIds: string[] = [], workspaceIds: string[] = [], oldFetch = globalThis.fetch;
  let googleFiles = false;
  let persistentGate = true, transientFailure = false, missingRefresh = false, loseNextImport = false;
  let pauseFirstCheck: (() => Promise<void>) | undefined;
  let puts = 0, providerExchanges = 0, wrongDestination = 0, revoked = false, broadScope = false, pauseExchange: (() => Promise<void>) | undefined;
  let dropboxReadGate = true, dropboxIdentity = "dbid:fictitious-account", legacyDropboxStarts = 0, applicationAccepted = true;
  let devicePolls = 0, deviceResult = "authorization_pending";
  const dropboxScopes = "account_info.read files.content.read files.metadata.read";
  const gatewayTokens = new Map<string, { kind: string; token: string; persistent?: boolean }>();
  const snapshot = () => ({ connector_catalog: CONNECTOR_CATALOG.map(kind => ({ name: kind.id, fields: kind.fieldNames.map(name => ({ name, label: name, secret: /token|secret/.test(name) })) })), connectors: [...gatewayTokens].map(([name, value]) => ({ name, kind: value.kind, settings: {}, secrets_set: ["token"], token_set: true, needs_sign_in: false, auth: "token" })) });
  globalThis.fetch = (async (raw, init) => {
    const url = new URL(String(raw)), method = init?.method || "GET";
    if (url.origin !== "http://127.0.0.1:18999") { wrongDestination++; throw new Error("Unexpected fictitious gateway destination"); }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fictitious-easy-oauth-gateway");
    if (url.pathname === "/v1/health") return Response.json({ ok: true, containers: true, version: "fictitious-oauth-gateway", lexopen_connector_gate: "v1", lexopen_connector_platform: "linux", lexopen_dropbox_read_gate: dropboxReadGate, ...(persistentGate ? { lexopen_persistent_oauth: "v1" } : {}) });
    if (url.pathname === "/v1/providers") return Response.json({ providers: [{ name: "fixture-model", kind: "openai" }] });
    if (url.pathname === "/v1/kitties") return Response.json({ kitties: [] });
    if (url.pathname === "/v1/settings") return Response.json(snapshot());
    if (url.pathname.startsWith("/v1/oauth/")) { legacyDropboxStarts++; throw new Error("Unexpected legacy OAuth request"); }
    if (url.pathname.endsWith("/test")) {
      const pause = pauseFirstCheck; pauseFirstCheck = undefined; if (pause) await pause();
      if (transientFailure) throw new Error("Fictitious offline network");
      return Response.json({ ok: !revoked, tested: true, ...(revoked ? { code: "oauth_reconnect_required" } : {}), account: "must-never-leave-private-profile" });
    }
    if (url.pathname.startsWith("/v1/lexopen/easy-oauth/")) {
      assert.equal(method, "POST"); const name = decodeURIComponent(url.pathname.split("/").pop()!), body = JSON.parse(String(init?.body));
      assert.ok(body.refresh_token.startsWith("fictitious-")); assert.ok(body.client_secret.includes("fictitious")); assert.ok(Date.parse(body.expires_at) > Date.now());
      assert.deepEqual(Object.keys(body).sort(), ["access_token", "account", "client_id", "client_secret", "expires_at", "kind", "refresh_token", "scopes"].sort());
      puts++; gatewayTokens.set(name, { kind: body.kind, token: body.access_token, persistent: true });
      if (loseNextImport) { loseNextImport = false; throw new Error("Fictitious import acknowledgement lost after acceptance"); }
      return Response.json({ name, kind: body.kind, persistent: true, auto_refresh: true });
    }
    if (url.pathname.startsWith("/v1/settings/connectors/")) {
      const name = decodeURIComponent(url.pathname.split("/").pop()!);
      if (method === "PUT") { puts++; const body = JSON.parse(String(init?.body)); gatewayTokens.set(name, { kind: body.kind, token: body.settings.token }); return Response.json(snapshot()); }
      if (method === "DELETE") { gatewayTokens.delete(name); return Response.json(snapshot()); }
    }
    throw new Error("Unexpected fictitious gateway endpoint");
  }) as typeof fetch;
  const providerFetch = (async (raw, init) => {
    const url = new URL(String(raw));
    assert.equal(url.searchParams.has("access_token"), false); assert.equal(url.username, ""); assert.equal(init?.redirect, "error");
    if (url.href === "https://github.com/login/device/code") {
      assert.deepEqual([...new URLSearchParams(String(init?.body))], [["client_id", "fictitious-public-github"], ["scope", "read:user"]]);
      return Response.json({ device_code: "a".repeat(40), user_code: "ABCD-1234", verification_uri: "https://github.com/login/device", expires_in: 900, interval: 5 });
    }
    if (url.href === "https://github.com/login/oauth/access_token" && new URLSearchParams(String(init?.body)).get("grant_type") === "urn:ietf:params:oauth:grant-type:device_code") {
      devicePolls++;
      const body = new URLSearchParams(String(init?.body)); assert.equal(body.get("client_secret"), null); assert.equal(body.get("client_id"), "fictitious-public-github"); assert.equal(body.get("device_code"), "a".repeat(40));
      return Response.json(deviceResult === "authorized" ? { access_token: "fictitious-github-consented-access", token_type: "bearer", scope: broadScope ? "repo" : "read:user" } : { error: deviceResult });
    }
    if (url.href === "https://api.github.com/applications/fictitious-github-client/token") {
      assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)), { access_token: "0000000000000000000000000000000000000000" });
      return Response.json({}, { status: applicationAccepted ? 404 : 401 });
    }
    if (["https://oauth2.googleapis.com/token", "https://github.com/login/oauth/access_token", "https://api.dropboxapi.com/oauth2/token"].includes(url.href)) {
      providerExchanges++; assert.equal(init?.method, "POST");
      const body = new URLSearchParams(String(init?.body)); assert.equal(body.get("grant_type"), "authorization_code"); assert.ok(body.get("code_verifier")); assert.match(body.get("redirect_uri")!, /^http:\/\/127.0.0.1:3349\/api\/altazor\/connectors\/oauth\/callback$/);
      const pause = pauseExchange; pauseExchange = undefined; if (pause) await pause();
      if (url.hostname === "api.dropboxapi.com") return Response.json({ access_token: "fictitious-dropbox-consented-access", token_type: "bearer", ...(!missingRefresh ? { refresh_token: "fictitious-dropbox-refresh-token" } : {}), account_id: "dbid:fictitious-account", scope: broadScope ? `${dropboxScopes} files.content.write` : dropboxScopes, expires_in: 14_400 });
      const google = url.hostname === "oauth2.googleapis.com";
      return Response.json({ access_token: google ? "fictitious-google-consented-access" : "fictitious-github-consented-access", token_type: "Bearer", scope: broadScope ? "repo" : google ? `https://www.googleapis.com/auth/drive.${googleFiles ? "readonly" : "metadata.readonly"}` : "read:user", ...(google ? { expires_in: 3600, ...(!missingRefresh ? { refresh_token: "fictitious-google-refresh-token" } : {}) } : {}) });
    }
    if (url.href === "https://api.dropboxapi.com/2/users/get_current_account") {
      assert.equal(init?.method, "POST"); assert.equal(init?.body, "null");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fictitious-dropbox-consented-access");
      return Response.json({ account_id: dropboxIdentity, email: "private@example.invalid" });
    }
    assert.equal(init?.method || "GET", "GET");
    if (url.hostname === "www.googleapis.com") { assert.equal(url.pathname, "/drive/v3/about"); assert.equal(url.searchParams.get("fields"), "user(permissionId)"); assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fictitious-google-consented-access"); return Response.json({ user: { permissionId: "fictitious-google-subject" } }); }
    if (url.href === "https://api.github.com/user") { assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fictitious-github-consented-access"); return Response.json({ id: 777, login: "private-profile-not-returned", email: "private@example.invalid" }); }
    throw new Error("Unexpected fake official endpoint");
  }) as typeof fetch;
  let organizationId = "";
  try {
    const org = await prisma.organization.create({ data: { name: "OAuth test fixture", settings: { create: { assistantLlmMode: "remote_allowed", require2faPrivileged: false } } } }); organizationId = org.id;
    const owner = await prisma.user.create({ data: { name: "OAuth fixture owner", email: `${stamp}@oauth.invalid`, role: "abogado", password: "not-a-login" } }); userIds.push(owner.id);
    const admin = await prisma.user.create({ data: { name: "OAuth fixture admin", email: `${stamp}-admin@oauth.invalid`, role: "admin", password: "not-a-login" } }); userIds.push(admin.id);
    const other = await prisma.user.create({ data: { name: "OAuth fixture outsider", email: `${stamp}-other@oauth.invalid`, role: "abogado", password: "not-a-login" } }); userIds.push(other.id);
    const actor = { id: owner.id, sessionVersion: owner.sessionVersion, sessionHash: digest("fictitious-browser-session") }, administrator = { id: admin.id, sessionVersion: admin.sessionVersion, sessionHash: digest("fictitious-admin-session") };
    const cause = await prisma.causa.create({ data: { titulo: "OAuth fixture case", materia: "civil", tribunal: "Fictitious tribunal", acceso: "equipo", abogadoId: owner.id } }); caseIds.push(cause.id);
    const configured = await configureComputer(owner, { causaId: cause.id, endpoint: "http://127.0.0.1:18999", token: "fictitious-easy-oauth-gateway", provider: "fixture-model", dedicated: true });
    const workspaceId = configured.workspaceId!; workspaceIds.push(workspaceId);
    const origin = "http://127.0.0.1:3349", options = { fetcher: providerFetch }, start = (provider: EasyOAuthProvider, suffix: string) => startEasyOAuth(actor, { provider, workspaceId, requestId: `oauth-${stamp}-${suffix}`, confirmed: true }, origin, options);
    const setup = await easyOAuthSetupStatus({}, origin);
    assert.equal(setup.providers[0].configured, false); assert.equal(setup.providers[0].callbackUri, origin + "/api/altazor/connectors/oauth/callback");
    const hostConfigured = await easyOAuthSetupStatus({ env: { NEXT_PUBLIC_APP_URL: origin, ALTAZOR_GOOGLE_CLIENT_ID: "fictitious-env-client", ALTAZOR_GOOGLE_CLIENT_SECRET: "fictitious-env-secret" } });
    assert.equal(hostConfigured.providers[0].configured, true); assert.equal(hostConfigured.providers[0].callbackUri, setup.providers[0].callbackUri); assert.equal(hostConfigured.providers[0].canEdit, false);
    assert.equal((await easyOAuthStatus(actor, workspaceId)).providers[0].state, "blocked");
    await assert.rejects(start("google", "blocked"), denied(503));
    await assert.rejects(saveEasyOAuthSetup(actor, { provider: "google", clientId: "fictitious-client", clientSecret: "fictitious-secret", confirmed: true }, origin), denied(403));
    const publicOptions = { fetcher: providerFetch, env: { APP_URL: origin, LEXOPEN_DESKTOP: "1", ALTAZOR_DISTRIBUTED_OAUTH: JSON.stringify({ schemaVersion: 1, google: { type: "installed", client_id: "1234567890-fictitiouspublicdesktop.apps.googleusercontent.com", client_secret: "fictitious-public-desktop-parameter" }, github: { type: "device", client_id: "fictitious-public-github" } }) } };
    const shipped = await easyOAuthSetupStatus(publicOptions);
    assert.equal(shipped.providers[0].configured, true); assert.equal(shipped.providers[0].source, "distributed");
    assert.equal(shipped.providers[1].configured, true); assert.equal(JSON.stringify(shipped).includes("fictitious-public-desktop-parameter"), false);
    assert.equal((await easyOAuthSetupStatus({ ...publicOptions, env: { ...publicOptions.env, LEXOPEN_DESKTOP: "0" } })).providers[0].configured, false);
    assert.equal((await easyOAuthSetupStatus({ ...publicOptions, env: { ...publicOptions.env, APP_URL: "https://elsewhere.invalid" } })).providers[0].configured, false);
    await prisma.integrationConfig.create({ data: { provider: "altazor-oauth-google", enabled: true, configJson: "{\"credentialsEnc\":\"unreadable-fictitious-operator-registration\"}" } });
    const brokenOperator = (await easyOAuthSetupStatus(publicOptions)).providers[0];
    assert.equal(brokenOperator.source, "saved"); assert.equal(brokenOperator.configured, false, "an unreadable operator registration must never switch identities silently");
    await prisma.integrationConfig.delete({ where: { provider: "altazor-oauth-google" } });
    const native = await startEasyOAuth(actor, { provider: "google", workspaceId, requestId: `native-${stamp}`, confirmed: true }, origin, publicOptions);
    assert.equal(native.flow, "external"); const nativeState = new URL(native.authUrl).searchParams.get("state")!; assert.ok(new URL(native.authUrl).searchParams.get("code_challenge"));
    const beforeCapture = providerExchanges;
    await assert.rejects(receiveEasyOAuth(actor, { state: nativeState, code: "fictitious-desktop-grant" }, origin, publicOptions), denied(409));
    assert.equal((await continueEasyOAuth(actor, native.attemptId, origin, publicOptions)).state, "pending");
    assert.equal(await captureInstalledOAuthReturn({ state: "x".repeat(43), code: "not-a-real-grant" }, origin, publicOptions), false);
    assert.equal(await captureInstalledOAuthReturn({ state: nativeState, code: "fictitious-desktop-grant" }, origin, publicOptions), true);
    assert.equal(providerExchanges, beforeCapture, "a browser without the application session may capture a code but never exchange it");
    const captured = await prisma.personalOAuthAttempt.findUniqueOrThrow({ where: { id: native.attemptId } });
    assert.equal(captured.resultEnc!.includes("fictitious-desktop-grant"), false);
    assert.equal(JSON.stringify(await easyOAuthStatus(actor, workspaceId, native.attemptId, publicOptions)).includes("fictitious-desktop-grant"), false);
    await assert.rejects(continueEasyOAuth({ ...actor, sessionHash: digest("other-browser") }, native.attemptId, origin, publicOptions), denied(404));
    assert.equal((await continueEasyOAuth(actor, native.attemptId, origin, publicOptions)).state, "completed");
    assert.equal((await easyOAuthStatus(actor, workspaceId, native.attemptId, publicOptions)).providers[0].autoRefresh, true);
    const device = await startEasyOAuth(actor, { provider: "github", workspaceId, requestId: `device-${stamp}`, confirmed: true }, origin, publicOptions);
    assert.equal(device.flow, "device"); assert.equal(device.authUrl, "https://github.com/login/device");
    const deviceRow = await prisma.personalOAuthAttempt.findUniqueOrThrow({ where: { id: device.attemptId } });
    assert.equal(deviceRow.resultEnc!.includes("a".repeat(40)), false);
    const deviceContext = `altazor:desktop:oauth:${actor.id}:${device.attemptId}`;
    const deviceBinding = unseal<{ state: string; device: { nextPollAt: number; interval: number } }>(deviceRow.resultEnc!, deviceContext);
    await assert.rejects(receiveEasyOAuth(actor, { state: deviceBinding.state, code: "not-a-device-completion" }, origin, publicOptions), denied(409));
    await assert.rejects(pollEasyOAuthDevice({ ...actor, id: other.id }, device.attemptId, origin, publicOptions), denied(404));
    await assert.rejects(pollEasyOAuthDevice(actor, device.attemptId, "http://127.0.0.1:1", publicOptions), denied(409));
    await pollEasyOAuthDevice(actor, device.attemptId, origin, publicOptions); assert.equal(devicePolls, 0);
    async function makeDeviceDue() {
      const row = await prisma.personalOAuthAttempt.findUniqueOrThrow({ where: { id: device.attemptId } });
      const binding = unseal<{ device: { nextPollAt: number } }>(row.resultEnc!, deviceContext); binding.device.nextPollAt = 0;
      await prisma.personalOAuthAttempt.update({ where: { id: row.id }, data: { resultEnc: seal(binding, deviceContext) } });
    }
    await makeDeviceDue();
    await Promise.all([pollEasyOAuthDevice(actor, device.attemptId, origin, publicOptions), pollEasyOAuthDevice(actor, device.attemptId, origin, publicOptions)]);
    assert.equal(devicePolls, 1, "parallel polling may exchange only once");
    deviceResult = "slow_down"; await makeDeviceDue(); await pollEasyOAuthDevice(actor, device.attemptId, origin, publicOptions);
    const deviceView = await easyOAuthStatus(actor, workspaceId, device.attemptId, publicOptions);
    assert.equal(deviceView.attempt?.device?.interval, 10); assert.equal(deviceView.attempt?.device?.userCode, "ABCD-1234"); assert.equal(JSON.stringify(deviceView).includes("a".repeat(40)), false);
    deviceResult = "authorized"; await makeDeviceDue(); const beforeDevice = puts;
    assert.equal((await pollEasyOAuthDevice(actor, device.attemptId, origin, publicOptions)).state, "completed");
    const deviceSaved = await easyOAuthStatus(actor, workspaceId, device.attemptId, publicOptions);
    assert.equal(deviceSaved.providers[1].connected, true); assert.equal(deviceSaved.attempt?.device, undefined); assert.equal(puts, beforeDevice + 1);
    await assert.rejects(pollEasyOAuthDevice(actor, device.attemptId, origin, publicOptions), denied(409)); assert.equal(puts, beforeDevice + 1);
    for (const provider of EASY_OAUTH_PROVIDERS) await saveEasyOAuthSetup(administrator, { provider, clientId: `fictitious-${provider}-client`, clientSecret: `fictitious-${provider}-operator-secret`, confirmed: true }, origin, { fetcher: providerFetch });
    assert.equal((await easyOAuthSetupStatus(publicOptions)).providers[0].source, "saved", "an existing operator identity wins over the installer profile");
    const beforeRejectedSetup = await prisma.integrationConfig.findUniqueOrThrow({ where: { provider: "altazor-oauth-github" } });
    applicationAccepted = false;
    await assert.rejects(saveEasyOAuthSetup(administrator, { provider: "github", clientId: "fictitious-github-client", clientSecret: "fictitious-wrong-secret", confirmed: true }, origin, { fetcher: providerFetch }), error => (error as { code?: string }).code === "oauth_client_credentials");
    assert.equal((await prisma.integrationConfig.findUniqueOrThrow({ where: { provider: "altazor-oauth-github" } })).configJson, beforeRejectedSetup.configJson, "Rejected application credentials must never replace saved setup");
    applicationAccepted = true;
    const persistedSetup = await prisma.integrationConfig.findMany({ where: { provider: { startsWith: "altazor-oauth-" } } });
    assert.equal(JSON.stringify(persistedSetup).includes("fictitious-google-operator-secret"), false);
    assert.equal(JSON.stringify(await easyOAuthSetupStatus()).includes("fictitious-google-client"), false);
    dropboxReadGate = false;
    assert.equal((await easyOAuthStatus(actor, workspaceId)).providers.find(item => item.provider === "dropbox")?.available, false);
    await assert.rejects(start("dropbox", "old-gateway"), denied(409));
    dropboxReadGate = true;
    persistentGate = false;
    await assert.rejects(start("google", "no-persistent-gate"), error => (error as { code?: string }).code === "oauth_persistence_required");
    persistentGate = true;
    for (const provider of EASY_OAUTH_PROVIDERS) {
      const begun = await start(provider, provider), auth = new URL(begun.authUrl), state = auth.searchParams.get("state")!;
      assert.equal(auth.hostname, { google: "accounts.google.com", github: "github.com", dropbox: "www.dropbox.com" }[provider]); assert.equal(auth.searchParams.get("code_challenge_method"), "S256"); assert.equal(auth.searchParams.has("client_secret"), false);
      if (provider === "dropbox") { assert.equal(auth.searchParams.get("scope"), dropboxScopes); assert.equal(auth.searchParams.get("token_access_type"), "offline"); assert.equal(auth.searchParams.has("include_granted_scopes"), false); }
      if (provider === "google") assert.equal(auth.searchParams.get("access_type"), "offline");
      const pending = await prisma.personalOAuthAttempt.findUniqueOrThrow({ where: { id: begun.attemptId } });
      const payload = unseal<{ verifier: string }>(pending.resultEnc!, `altazor:desktop:oauth:${owner.id}:${pending.id}`);
      assert.equal(auth.searchParams.get("code_challenge"), createHash("sha256").update(payload.verifier).digest("base64url")); assert.equal(pending.resultEnc!.includes(payload.verifier), false);
      assert.equal((await start(provider, provider)).authUrl, begun.authUrl);
      await assert.rejects(receiveEasyOAuth({ ...actor, sessionHash: digest("other-browser") }, { state, code: "fake-code" }, origin, options), denied(404));
      const before = providerExchanges;
      await receiveEasyOAuth(actor, { state, code: "fictitious-code" }, origin, options);
      assert.equal(providerExchanges, before + 1);
      const status = await easyOAuthStatus(actor, workspaceId, begun.attemptId);
      assert.equal(status.providers.find(item => item.provider === provider)?.connected, true); assert.equal(status.attempt?.state, "completed");
      assert.equal(status.providers.find(item => item.provider === provider)?.autoRefresh, provider !== "github");
      assert.equal(status.providers.find(item => item.provider === provider)?.persistent, true);
      for (const secret of ["fictitious-google-consented-access", "fictitious-github-consented-access", "fictitious-dropbox-consented-access", "fictitious-google-refresh-token", "fictitious-dropbox-refresh-token", "dbid:fictitious-account", "private-profile-not-returned", "must-never-leave-private-profile", "private@example.invalid"]) assert.equal(JSON.stringify(status).includes(secret), false);
      await assert.rejects(receiveEasyOAuth(actor, { state, code: "fictitious-code" }, origin, options), denied(409)); assert.equal(providerExchanges, before + 1);
      const stored = await prisma.personalOAuthAttempt.findUniqueOrThrow({ where: { id: begun.attemptId } });
      assert.equal(stored.resultEnc!.includes(payload.verifier), false);
    }
    assert.equal((await easyOAuthStatus(actor, workspaceId)).providers[0].canReadFiles, false);
    const fileInput = { provider: "google" as const, workspaceId, requestId: `oauth-${stamp}-files`, access: "files" as const, confirmed: true as const };
    const files = await startEasyOAuth(actor, fileInput, origin, options);
    assert.equal(new URL(files.authUrl).searchParams.get("scope"), "https://www.googleapis.com/auth/drive.readonly");
    assert.equal(new URL(files.authUrl).searchParams.get("include_granted_scopes"), "false");
    await assert.rejects(startEasyOAuth(actor, { ...fileInput, access: "basic" }, origin, options), error => (error as { code?: string }).code === "request_conflict");
    await assert.rejects(startEasyOAuth(actor, { ...fileInput, provider: "github", requestId: `oauth-${stamp}-github-files` }, origin, options), denied(400));
    googleFiles = true;
    await receiveEasyOAuth(actor, { state: new URL(files.authUrl).searchParams.get("state")!, code: "fictitious-files-consent" }, origin, options);
    const fileStatus = (await easyOAuthStatus(actor, workspaceId, files.attemptId)).providers[0];
    assert.equal(fileStatus.canReadFiles, true); assert.deepEqual(fileStatus.grantedScopes, ["https://www.googleapis.com/auth/drive.readonly"]);
    googleFiles = false;
    const exchangesAfterConsent = providerExchanges;
    for (let check = 0; check < 3; check++) {
      const savedStatus = (await easyOAuthStatus(actor, workspaceId)).providers[0];
      assert.equal(savedStatus.state, "connected"); assert.equal(savedStatus.autoRefresh, true); assert.equal(savedStatus.expiresAt, null);
    }
    assert.equal(providerExchanges, exchangesAfterConsent, "reloading a saved connection does not start another authorization");
    transientFailure = true;
    const offlineStatus = (await easyOAuthStatus(actor, workspaceId)).providers[0];
    assert.equal(offlineStatus.state, "unavailable"); assert.equal(offlineStatus.autoRefresh, true); assert.equal(offlineStatus.connected, false);
    assert.equal(providerExchanges, exchangesAfterConsent);
    transientFailure = false;
    assert.equal((await easyOAuthStatus(actor, workspaceId)).providers[0].connected, true);
    const offlineReturn = await start("google", "offline-first-check"), beforeOfflineReturn = providerExchanges;
    transientFailure = true;
    await receiveEasyOAuth(actor, { state: new URL(offlineReturn.authUrl).searchParams.get("state")!, code: "fictitious-offline-check-code" }, origin, options);
    const storedOffline = (await easyOAuthStatus(actor, workspaceId, offlineReturn.attemptId));
    assert.equal(storedOffline.attempt?.state, "completed", "a confirmed saved grant survives an offline first check");
    assert.equal(storedOffline.providers[0].state, "unavailable"); assert.equal(storedOffline.providers[0].autoRefresh, true);
    assert.equal(storedOffline.providers[0].lastVerifiedAt, null);
    transientFailure = false;
    assert.equal((await easyOAuthStatus(actor, workspaceId)).providers[0].connected, true);
    assert.equal(providerExchanges, beforeOfflineReturn + 1, "recovering the first check needs no second authorization");
    const slowCheck = await start("google", "slow-first-check");
    let releaseCheck!: () => void, reachedCheck!: () => void;
    const checkWait = new Promise<void>(resolve => { releaseCheck = resolve; }), checkBarrier = new Promise<void>(resolve => { reachedCheck = resolve; });
    pauseFirstCheck = async () => { reachedCheck(); await checkWait; };
    const checkingReturn = receiveEasyOAuth(actor, { state: new URL(slowCheck.authUrl).searchParams.get("state")!, code: "fictitious-slow-check-code" }, origin, options);
    await checkBarrier;
    const committedWhileChecking = await prisma.personalOAuthAttempt.findUniqueOrThrow({ where: { id: slowCheck.attemptId } });
    const grantWhileChecking = await prisma.personalConnectorAccount.findUniqueOrThrow({ where: { ownerId_provider: { ownerId: owner.id, provider: `altazor-desktop:${workspaceId}:google` } } });
    releaseCheck(); await checkingReturn;
    assert.equal(committedWhileChecking.phase, "completed", "the consumed attempt commits before the remote verification RPC");
    assert.ok(grantWhileChecking.credentialsEnc, "the durable proof survives even if the first verification stalls");
    assert.equal(grantWhileChecking.lastVerifiedAt, null, "a pending first check is not advertised as verified");
    for (const provider of ["google", "dropbox"] as const) {
      missingRefresh = true;
      const attempt = await start(provider, `${provider}-missing-refresh`), before = puts;
      await receiveEasyOAuth(actor, { state: new URL(attempt.authUrl).searchParams.get("state")!, code: "fictitious-missing-refresh" }, origin, options);
      assert.equal(puts, before, "no credentials are sent without a persistent grant");
      assert.equal((await prisma.personalOAuthAttempt.findUniqueOrThrow({ where: { id: attempt.attemptId } })).errorCode, "oauth_refresh_missing");
      missingRefresh = false;
    }
    const oldOnline = await start("google", "old-online"), oldAttempt = await prisma.personalOAuthAttempt.findUniqueOrThrow({ where: { id: oldOnline.attemptId } });
    const oldBinding = unseal<Record<string, unknown>>(oldAttempt.resultEnc!, `altazor:desktop:oauth:${owner.id}:${oldAttempt.id}`); delete oldBinding.persistence;
    await prisma.personalOAuthAttempt.update({ where: { id: oldAttempt.id }, data: { resultEnc: seal(oldBinding, `altazor:desktop:oauth:${owner.id}:${oldAttempt.id}`) } });
    await assert.rejects(start("google", "old-online"), error => (error as { code?: string }).code === "request_conflict");
    const beforeOutdated = providerExchanges;
    await receiveEasyOAuth(actor, { state: new URL(oldOnline.authUrl).searchParams.get("state")!, code: "fictitious-outdated-code" }, origin, options);
    assert.equal(providerExchanges, beforeOutdated, "a previous online attempt cannot be upgraded silently");
    assert.equal((await prisma.personalOAuthAttempt.findUniqueOrThrow({ where: { id: oldAttempt.id } })).errorCode, "oauth_attempt_outdated");
    const persistedPrivate = JSON.stringify(await prisma.personalConnectorAccount.findMany({ where: { ownerId: owner.id } })) + JSON.stringify(await prisma.altazorConnectorOperation.findMany({ where: { ownerId: owner.id } }));
    for (const secret of ["fictitious-google-refresh-token", "fictitious-dropbox-refresh-token", "fictitious-google-operator-secret", "fictitious-dropbox-operator-secret"]) assert.equal(persistedPrivate.includes(secret), false);
    revoked = true; const revokedStatus = (await easyOAuthStatus(actor, workspaceId)).providers[0]; assert.equal(revokedStatus.connected, false); assert.equal(revokedStatus.hasStoredConnection, true); assert.equal(revokedStatus.canDisconnect, true); revoked = false;
    assert.equal(revokedStatus.state, "reconnect_required", "a revoked grant differs from a transient outage");
    const googleAccount = await prisma.personalConnectorAccount.findUniqueOrThrow({ where: { ownerId_provider: { ownerId: owner.id, provider: `altazor-desktop:${workspaceId}:google` } } });
    await prisma.personalConnectorAccount.update({ where: { id: googleAccount.id }, data: { expiresAt: new Date(0) } });
    assert.equal((await easyOAuthStatus(actor, workspaceId)).providers[0].connected, true, "an access-token expiry does not expire the durable grant");
    const oldProof = unseal<Record<string, unknown>>(googleAccount.credentialsEnc!, `altazor:desktop:connection:${owner.id}:${googleAccount.id}`); oldProof.autoRefresh = false;
    await prisma.personalConnectorAccount.update({ where: { id: googleAccount.id }, data: { credentialsEnc: seal(oldProof, `altazor:desktop:connection:${owner.id}:${googleAccount.id}`) } });
    const expiredConnection = (await easyOAuthStatus(actor, workspaceId)).providers[0]; assert.equal(expiredConnection.state, "expired"); assert.equal(expiredConnection.canDisconnect, true);
    const googleName = easyConnectionName(owner.id, workspaceId, "google");
    await configureConnector(owner, workspaceId, `advanced-${stamp}`, googleName, { kind: "google-workspace", settings: { token: "different-fictitious-token" } });
    assert.equal((await easyOAuthStatus(actor, workspaceId)).providers[0].connected, false);
    await removeConnector(owner, workspaceId, `remove-${stamp}`, easyConnectionName(owner.id, workspaceId, "github"));
    assert.equal((await easyOAuthStatus(actor, workspaceId)).providers[1].connected, false);
    const dropboxName = easyConnectionName(owner.id, workspaceId, "dropbox");
    const legacyStartId = `legacy-start-${stamp}`, legacyPutId = `legacy-put-${stamp}`, beforeLegacy = puts;
    const guidedOnly = (error: unknown) => (error as { code?: string }).code === "dropbox_guided_oauth_required";
    await assert.rejects(beginConnectorOAuth(owner, workspaceId, legacyStartId, dropboxName), guidedOnly);
    await assert.rejects(configureConnector(owner, workspaceId, legacyPutId, dropboxName, { kind: "dropbox", settings: {}, signIn: true }), guidedOnly);
    assert.equal(legacyDropboxStarts, 0); assert.equal(puts, beforeLegacy);
    assert.equal(await prisma.altazorConnectorOperation.count({ where: { ownerId: owner.id, requestId: { in: [legacyStartId, legacyPutId] } } }), 0);
    await removeConnector(owner, workspaceId, `remove-dropbox-${stamp}`, dropboxName);
    assert.equal((await easyOAuthStatus(actor, workspaceId)).providers.find(item => item.provider === "dropbox")?.connected, false);
    for (const rejected of ["broad", "different-account"]) {
      broadScope = rejected === "broad";
      dropboxIdentity = rejected === "different-account" ? "dbid:unexpected-account" : "dbid:fictitious-account";
      const attempt = await start("dropbox", `dropbox-${rejected}`), before = puts;
      await receiveEasyOAuth(actor, { state: new URL(attempt.authUrl).searchParams.get("state")!, code: "fake" }, origin, options);
      assert.equal(puts, before);
      assert.equal((await easyOAuthStatus(actor, workspaceId, attempt.attemptId)).attempt?.state, "failed");
    }
    broadScope = false; dropboxIdentity = "dbid:fictitious-account";
    const active = await prisma.altazorComputerSession.create({ data: { ownerId: owner.id, workspaceId, requestId: `active-${stamp}`, kittyName: "fictitious-active", state: "ready", expiresAt: new Date(Date.now() + 60_000) } });
    await assert.rejects(start("google", "active"), denied(409));
    await prisma.altazorComputerSession.update({ where: { id: active.id }, data: { expiresAt: new Date(0) } });
    const beforeExpiredPut = puts;
    await assert.rejects(start("google", "expired-live-kitty"), denied(409));
    await assert.rejects(configureConnector(owner, workspaceId, `expired-config-${stamp}`, googleName, { kind: "google-workspace", settings: { token: "must-not-rotate-expired-kitty" } }), denied(409));
    await assert.rejects(removeConnector(owner, workspaceId, `expired-remove-${stamp}`, googleName), denied(409));
    assert.equal(puts, beforeExpiredPut); assert.equal((await easyOAuthStatus(actor, workspaceId)).requiresStop, true);
    await prisma.altazorComputerSession.delete({ where: { id: active.id } });
    const activeReturn = await start("google", "active-return"), activeState = new URL(activeReturn.authUrl).searchParams.get("state")!;
    const newActive = await prisma.altazorComputerSession.create({ data: { ownerId: owner.id, workspaceId, requestId: `active-return-${stamp}`, kittyName: "fictitious-active", state: "ready", expiresAt: new Date(Date.now() + 60_000) } });
    await assert.rejects(receiveEasyOAuth(actor, { state: activeState, code: "fake" }, origin, options), denied(409));
    assert.equal((await failEasyOAuthReturn(actor, activeState)).causaId, cause.id);
    assert.equal((await easyOAuthStatus(actor, workspaceId, activeReturn.attemptId)).attempt?.state, "failed");
    assert.equal((await easyOAuthStatus(actor, workspaceId)).providers[0].canDisconnect, false);
    await prisma.altazorComputerSession.delete({ where: { id: newActive.id } });
    const expiredAttempt = await start("google", "expired"), expiredState = new URL(expiredAttempt.authUrl).searchParams.get("state")!;
    await prisma.personalOAuthAttempt.update({ where: { id: expiredAttempt.attemptId }, data: { expiresAt: new Date(0) } });
    await assert.rejects(receiveEasyOAuth(actor, { state: expiredState, code: "fake" }, origin, options), denied(404));
    assert.equal((await easyOAuthStatus(actor, workspaceId, expiredAttempt.attemptId)).attempt?.state, "expired");
    const deniedAttempt = await start("google", "denied"), beforeDenied = providerExchanges;
    await receiveEasyOAuth(actor, { state: new URL(deniedAttempt.authUrl).searchParams.get("state")!, denied: true }, origin, options); assert.equal(providerExchanges, beforeDenied);
    assert.equal((await easyOAuthStatus(actor, workspaceId, deniedAttempt.attemptId)).attempt?.state, "failed");
    broadScope = true;
    const broad = await start("github", "broad"), beforeBroad = puts;
    await receiveEasyOAuth(actor, { state: new URL(broad.authUrl).searchParams.get("state")!, code: "fake" }, origin, options);
    assert.equal(puts, beforeBroad); assert.equal((await easyOAuthStatus(actor, workspaceId, broad.attemptId)).attempt?.state, "failed"); broadScope = false;
    revoked = true;
    const failedTest = await start("google", "failed-test");
    await receiveEasyOAuth(actor, { state: new URL(failedTest.authUrl).searchParams.get("state")!, code: "fake" }, origin, options);
    const failedStatus = await easyOAuthStatus(actor, workspaceId, failedTest.attemptId); assert.equal(failedStatus.attempt?.state, "completed"); assert.equal(failedStatus.providers[0].state, "reconnect_required"); assert.equal(failedStatus.providers[0].connected, false); assert.equal(failedStatus.providers[0].hasStoredConnection, true); assert.equal(failedStatus.providers[0].canDisconnect, true); revoked = false;
    const rotation = await start("google", "rotation"), rotationState = new URL(rotation.authUrl).searchParams.get("state")!;
    let release!: () => void, reached!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; }), barrier = new Promise<void>(resolve => { reached = resolve; });
    pauseExchange = async () => { reached(); await waiting; };
    const beforeRotation = puts, pendingReturn = receiveEasyOAuth(actor, { state: rotationState, code: "fake" }, origin, options);
    await barrier;
    await saveEasyOAuthSetup(administrator, { provider: "google", clientId: "fictitious-google-client", clientSecret: "rotated-fictitious-secret", confirmed: true }, origin);
    release(); await pendingReturn; assert.equal(puts, beforeRotation);
    assert.equal((await easyOAuthStatus(actor, workspaceId, rotation.attemptId)).attempt?.state, "cancelled");
    assert.equal((await easyOAuthReturnContext(actor, rotationState)).causaId, cause.id);
    const expected = await prisma.altazorComputerWorkspace.findUniqueOrThrow({ where: { id: workspaceId } });
    await prisma.altazorComputerWorkspace.update({ where: { id: workspaceId }, data: { endpoint: "http://127.0.0.1:18998" } });
    await assert.rejects(configureConnector(owner, workspaceId, `changed-dest-${stamp}`, googleName, { kind: "google-workspace", settings: { token: "must-not-send-to-new-gateway" } }, expected), denied(409)); assert.equal(wrongDestination, 0);
    await prisma.altazorComputerWorkspace.update({ where: { id: workspaceId }, data: { endpoint: expected.endpoint } });
    const lostImport = await start("google", "lost-import"), lostState = new URL(lostImport.authUrl).searchParams.get("state")!, beforeLostImport = puts;
    loseNextImport = true;
    await receiveEasyOAuth(actor, { state: lostState, code: "fictitious-lost-import-code" }, origin, options);
    assert.equal(puts, beforeLostImport + 1);
    const importOperation = await prisma.altazorConnectorOperation.findUniqueOrThrow({ where: { ownerId_requestId: { ownerId: owner.id, requestId: `oauth:${lostImport.attemptId}` } } });
    assert.equal(importOperation.status, "unknown", "an ambiguous import is never replayed, including after token rotation");
    await assert.rejects(receiveEasyOAuth(actor, { state: lostState, code: "fictitious-lost-import-code" }, origin, options), denied(409));
    assert.equal(puts, beforeLostImport + 1);
    await prisma.causa.update({ where: { id: cause.id }, data: { abogadoId: other.id } });
    await assert.rejects(easyOAuthStatus(actor, workspaceId), denied(404)); await assert.rejects(easyOAuthReturnContext(actor, rotationState), denied(404));
    await prisma.causa.update({ where: { id: cause.id }, data: { abogadoId: owner.id } });
    await prisma.user.update({ where: { id: owner.id }, data: { sessionVersion: owner.sessionVersion + 1 } });
    await assert.rejects(easyOAuthStatus(actor, workspaceId), denied(401));
    console.log("Easy OAuth PG PASS: Google, GitHub and Dropbox PKCE, original session, one-use callback, encrypted setup/verifier, exact read-only scopes, confirmed access, invalidation, active desktop denial, configuration rotation and current ACL/session checks. HTTP is simulated.");
  } finally {
    globalThis.fetch = oldFetch;
    await prisma.personalOAuthAttempt.deleteMany({ where: { ownerId: { in: userIds } } }); await prisma.personalConnectorAccount.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.altazorComputerAction.deleteMany({ where: { ownerId: { in: userIds } } }); await prisma.altazorComputerSession.deleteMany({ where: { ownerId: { in: userIds } } }); await prisma.altazorConnectorOperation.deleteMany({ where: { ownerId: { in: userIds } } }); await prisma.altazorComputerWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.causa.deleteMany({ where: { id: { in: caseIds } } }); await prisma.user.deleteMany({ where: { id: { in: userIds } } }); await prisma.integrationConfig.deleteMany({ where: { provider: { in: EASY_OAUTH_PROVIDERS.map(provider => `altazor-oauth-${provider}`) } } });
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } }); await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "OAuth integration failed"); process.exitCode = 1; });
