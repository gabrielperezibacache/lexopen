/** Owned disposable PostgreSQL plus fake official HTTP endpoints; no real accounts. */
import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { digest, unseal } from "@/lib/personal-connectors/core";
import { configureComputer } from "../computer/service";
import { configureConnector, removeConnector } from "./service";
import { CONNECTOR_CATALOG } from "./catalog";
import { easyConnectionName, easyOAuthReturnContext, failEasyOAuthReturn, easyOAuthSetupStatus, easyOAuthStatus, receiveEasyOAuth, saveEasyOAuthSetup, startEasyOAuth, type EasyOAuthProvider } from "./easy-oauth";

const denied = (status: number) => (error: unknown) => (error as { status?: number }).status === status;
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  process.env.ALTAZOR_COMPUTER_ENABLED = "1";
  const stamp = randomUUID(), userIds: string[] = [], caseIds: string[] = [], workspaceIds: string[] = [], oldFetch = globalThis.fetch;
  let puts = 0, providerExchanges = 0, wrongDestination = 0, revoked = false, broadScope = false, pauseExchange: (() => Promise<void>) | undefined;
  const gatewayTokens = new Map<string, { kind: string; token: string }>();
  const snapshot = () => ({ connector_catalog: CONNECTOR_CATALOG.map(kind => ({ name: kind.id, fields: kind.fieldNames.map(name => ({ name, label: name, secret: /token|secret/.test(name) })) })), connectors: [...gatewayTokens].map(([name, value]) => ({ name, kind: value.kind, settings: {}, secrets_set: ["token"], token_set: true, needs_sign_in: false, auth: "token" })) });
  globalThis.fetch = (async (raw, init) => {
    const url = new URL(String(raw)), method = init?.method || "GET";
    if (url.origin !== "http://127.0.0.1:18999") { wrongDestination++; throw new Error("Unexpected fictitious gateway destination"); }
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fictitious-easy-oauth-gateway");
    if (url.pathname === "/v1/health") return Response.json({ ok: true, containers: true, version: "fictitious-oauth-gateway", lexopen_connector_gate: "v1", lexopen_connector_platform: "linux" });
    if (url.pathname === "/v1/providers") return Response.json({ providers: [{ name: "fixture-model", kind: "openai" }] });
    if (url.pathname === "/v1/kitties") return Response.json({ kitties: [] });
    if (url.pathname === "/v1/settings") return Response.json(snapshot());
    if (url.pathname.endsWith("/test")) return Response.json({ ok: !revoked, tested: true, account: "must-never-leave-private-profile" });
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
    if (url.href === "https://oauth2.googleapis.com/token" || url.href === "https://github.com/login/oauth/access_token") {
      providerExchanges++; assert.equal(init?.method, "POST");
      const body = new URLSearchParams(String(init?.body)); assert.equal(body.get("grant_type"), "authorization_code"); assert.ok(body.get("code_verifier")); assert.match(body.get("redirect_uri")!, /^http:\/\/127.0.0.1:3349\/api\/altazor\/connectors\/oauth\/callback$/);
      const pause = pauseExchange; pauseExchange = undefined; if (pause) await pause();
      const google = url.hostname === "oauth2.googleapis.com";
      return Response.json({ access_token: google ? "fictitious-google-consented-access" : "fictitious-github-consented-access", token_type: "Bearer", scope: broadScope ? "repo" : google ? "https://www.googleapis.com/auth/drive.metadata.readonly" : "read:user", ...(google ? { expires_in: 3600 } : {}) });
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
    for (const provider of ["google", "github"] as const) await saveEasyOAuthSetup(administrator, { provider, clientId: `fictitious-${provider}-client`, clientSecret: `fictitious-${provider}-operator-secret`, confirmed: true }, origin);
    const persistedSetup = await prisma.integrationConfig.findMany({ where: { provider: { startsWith: "altazor-oauth-" } } });
    assert.equal(JSON.stringify(persistedSetup).includes("fictitious-google-operator-secret"), false);
    assert.equal(JSON.stringify(await easyOAuthSetupStatus()).includes("fictitious-google-client"), false);
    for (const provider of ["google", "github"] as const) {
      const begun = await start(provider, provider), auth = new URL(begun.authUrl), state = auth.searchParams.get("state")!;
      assert.equal(auth.hostname, provider === "google" ? "accounts.google.com" : "github.com"); assert.equal(auth.searchParams.get("code_challenge_method"), "S256"); assert.equal(auth.searchParams.has("client_secret"), false);
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
      for (const secret of ["fictitious-google-consented-access", "fictitious-github-consented-access", "private-profile-not-returned", "must-never-leave-private-profile", "private@example.invalid"]) assert.equal(JSON.stringify(status).includes(secret), false);
      await assert.rejects(receiveEasyOAuth(actor, { state, code: "fictitious-code" }, origin, options), denied(409)); assert.equal(providerExchanges, before + 1);
      const stored = await prisma.personalOAuthAttempt.findUniqueOrThrow({ where: { id: begun.attemptId } });
      assert.equal(stored.resultEnc!.includes(payload.verifier), false);
    }
    revoked = true; const revokedStatus = (await easyOAuthStatus(actor, workspaceId)).providers[0]; assert.equal(revokedStatus.connected, false); assert.equal(revokedStatus.hasStoredConnection, true); assert.equal(revokedStatus.canDisconnect, true); revoked = false;
    const googleAccount = await prisma.personalConnectorAccount.findUniqueOrThrow({ where: { ownerId_provider: { ownerId: owner.id, provider: `altazor-desktop:${workspaceId}:google` } } });
    await prisma.personalConnectorAccount.update({ where: { id: googleAccount.id }, data: { expiresAt: new Date(0) } });
    const expiredConnection = (await easyOAuthStatus(actor, workspaceId)).providers[0]; assert.equal(expiredConnection.state, "expired"); assert.equal(expiredConnection.canDisconnect, true);
    const googleName = easyConnectionName(owner.id, workspaceId, "google");
    await configureConnector(owner, workspaceId, `advanced-${stamp}`, googleName, { kind: "google-workspace", settings: { token: "different-fictitious-token" } });
    assert.equal((await easyOAuthStatus(actor, workspaceId)).providers[0].connected, false);
    await removeConnector(owner, workspaceId, `remove-${stamp}`, easyConnectionName(owner.id, workspaceId, "github"));
    assert.equal((await easyOAuthStatus(actor, workspaceId)).providers[1].connected, false);
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
    const failedStatus = await easyOAuthStatus(actor, workspaceId, failedTest.attemptId); assert.equal(failedStatus.attempt?.state, "failed"); assert.equal(failedStatus.providers[0].connected, false); assert.equal(failedStatus.providers[0].hasStoredConnection, true); assert.equal(failedStatus.providers[0].canDisconnect, true); revoked = false;
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
    await prisma.causa.update({ where: { id: cause.id }, data: { abogadoId: other.id } });
    await assert.rejects(easyOAuthStatus(actor, workspaceId), denied(404)); await assert.rejects(easyOAuthReturnContext(actor, rotationState), denied(404));
    await prisma.causa.update({ where: { id: cause.id }, data: { abogadoId: owner.id } });
    await prisma.user.update({ where: { id: owner.id }, data: { sessionVersion: owner.sessionVersion + 1 } });
    await assert.rejects(easyOAuthStatus(actor, workspaceId), denied(401));
    console.log("Easy OAuth PG PASS: official Google/GitHub PKCE, original session, one-use callback, encrypted setup/verifier, exact read-only scopes, real connector test before green, revoked/advanced mutation invalidation, active desktop denial, operator rotation while exchange paused, expected gateway binding and current ACL/session revocation. HTTP is fictitious only.");
  } finally {
    globalThis.fetch = oldFetch;
    await prisma.personalOAuthAttempt.deleteMany({ where: { ownerId: { in: userIds } } }); await prisma.personalConnectorAccount.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.altazorComputerAction.deleteMany({ where: { ownerId: { in: userIds } } }); await prisma.altazorComputerSession.deleteMany({ where: { ownerId: { in: userIds } } }); await prisma.altazorConnectorOperation.deleteMany({ where: { ownerId: { in: userIds } } }); await prisma.altazorComputerWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.causa.deleteMany({ where: { id: { in: caseIds } } }); await prisma.user.deleteMany({ where: { id: { in: userIds } } }); await prisma.integrationConfig.deleteMany({ where: { provider: { in: ["altazor-oauth-google", "altazor-oauth-github"] } } });
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } }); await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "OAuth integration failed"); process.exitCode = 1; });
