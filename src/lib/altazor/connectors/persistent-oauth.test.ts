import assert from "node:assert/strict";
import test from "node:test";
import { KittiesGateway } from "../computer/gateway";
import { GOOGLE_FILES_SCOPE, GOOGLE_MANAGE_SCOPE } from "./oauth-access";
import { validatePersistentEasyOAuth, type PersistentEasyOAuthConfiguration } from "./persistent-oauth";

const configuration = (): PersistentEasyOAuthConfiguration => ({ kind: "google-workspace", clientId: "fictitious-client", clientSecret: "fictitious-app-secret", accessToken: "fictitious-access-token", refreshToken: "fictitious-refresh-token", scopes: [GOOGLE_FILES_SCOPE], expiresAt: new Date(Date.now() + 3600_000).toISOString() });
const name = "altazor-google-0123456789abcdef";

test("persistent account setup requires exact read scopes, refresh credentials and future access expiry", () => {
  assert.equal(validatePersistentEasyOAuth(configuration()).kind, "google-workspace");
  for (const input of [
    { ...configuration(), refreshToken: "" },
    { ...configuration(), refreshToken: "invalid\ncredential" },
    { ...configuration(), clientSecret: "" },
    { ...configuration(), scopes: [GOOGLE_FILES_SCOPE, "https://www.googleapis.com/auth/drive"] },
    { ...configuration(), scopes: [GOOGLE_FILES_SCOPE, GOOGLE_FILES_SCOPE] },
    { ...configuration(), expiresAt: new Date(0).toISOString() },
    { ...configuration(), expiresAt: "not-a-date" },
  ]) assert.throws(() => validatePersistentEasyOAuth(input), error => (error as { code?: string }).code === "oauth_persistence_invalid");
});

test("a gateway without durable OAuth never receives the refresh or client credentials", async () => {
  const calls: string[] = [];
  const fetcher: typeof fetch = async (raw, options) => {
    calls.push(String(options?.method || "GET"));
    assert.equal(new URL(String(raw)).pathname, "/v1/health");
    assert.equal(options?.body, undefined);
    return Response.json({ ok: true });
  };
  const client = new KittiesGateway("http://127.0.0.1:7494", "fictitious-gateway-token", fetcher);
  await assert.rejects(client.setPersistentEasyOAuth(name, configuration()), error => (error as { code?: string }).code === "oauth_persistence_required");
  assert.deepEqual(calls, ["GET"]);
});

test("durable transfer uses only the authenticated gateway endpoint and projects its safe receipt", async () => {
  let posts = 0;
  const input = configuration();
  const fetcher: typeof fetch = async (raw, options) => {
    const url = new URL(String(raw)); assert.equal(url.origin, "http://127.0.0.1:7494"); assert.equal(url.search, "");
    assert.equal(new Headers(options?.headers).get("authorization"), "Bearer fictitious-gateway-token");
    assert.equal(options?.redirect, "error");
    if (url.pathname === "/v1/health") return Response.json({ ok: true, lexopen_persistent_oauth: "v1" });
    assert.equal(url.pathname, `/v1/lexopen/easy-oauth/${name}`); assert.equal(options?.method, "POST"); posts++;
    const body = JSON.parse(String(options.body));
    assert.equal(body.refresh_token, input.refreshToken); assert.equal(body.client_secret, input.clientSecret);
    return Response.json({ name, kind: input.kind, persistent: true, auto_refresh: true, ignored_private_field: "never-project-me" });
  };
  const client = new KittiesGateway("http://127.0.0.1:7494", "fictitious-gateway-token", fetcher);
  assert.deepEqual(await client.setPersistentEasyOAuth(name, input), { persistent: true, autoRefresh: true });
  assert.equal(posts, 1);
});

test("unconfirmed persistence never becomes a durable connection claim or a hidden retry", async () => {
  let posts = 0;
  const fetcher: typeof fetch = async raw => {
    if (new URL(String(raw)).pathname === "/v1/health") return Response.json({ ok: true, lexopen_persistent_oauth: "v1" });
    posts++; return Response.json({ name, kind: "google-workspace", persistent: true, auto_refresh: false });
  };
  const client = new KittiesGateway("http://127.0.0.1:7494", "fictitious-gateway-token", fetcher);
  await assert.rejects(client.setPersistentEasyOAuth(name, configuration()), error => (error as { code?: string }).code === "oauth_save_unknown");
  assert.equal(posts, 1);
});

test("expiring GitHub grants accept only exact read:user and distinguish web credentials from a public device client", () => {
  const web = { ...configuration(), kind: "github" as const, clientId: "Ov23.fictitious-client", scopes: ["read:user"], expiresAt: new Date(Date.now() + 28800_000).toISOString() };
  assert.equal(validatePersistentEasyOAuth(web).kind, "github");
  assert.equal(validatePersistentEasyOAuth({ ...web, publicClient: true, clientSecret: "" }).publicClient, true);
  for (const change of [{ scopes: ["repo"] }, { scopes: ["read:user", "repo"] }, { scopes: ["read:user", "read:user"] }, { scopes: ["read:user", "offline_access"] }, { clientSecret: "" }, { publicClient: true, clientSecret: "unexpected-device-secret" }, { refreshToken: "" }, { clientId: "https://wrong.invalid" }, { expiresAt: new Date(0).toISOString() }]) assert.throws(() => validatePersistentEasyOAuth({ ...web, ...change }), error => (error as { code?: string }).code === "oauth_persistence_invalid");
});

test("GitHub refresh capability is required before sending either web or device credentials", async () => {
  for (const publicClient of [false, true]) {
    const input: PersistentEasyOAuthConfiguration = { ...configuration(), kind: "github", scopes: ["read:user"], ...(publicClient ? { publicClient: true, clientSecret: "" } : {}) };
    for (const supported of [false, true]) {
      let posts = 0;
      const githubName = "altazor-github-0123456789abcdef";
      const client = new KittiesGateway("http://127.0.0.1:7494", "fictitious-gateway-token", async (url, init) => {
        if (new URL(String(url)).pathname === "/v1/health") return Response.json({ ok: true, lexopen_persistent_oauth: "v1", ...(supported ? { lexopen_github_persistent_oauth: "v1" } : {}) });
        posts++; const body = JSON.parse(String(init?.body));
        assert.equal(body.kind, "github"); assert.deepEqual(body.scopes, ["read:user"]);
        assert.equal(body.refresh_token, input.refreshToken);
        assert.equal(body.public_client, publicClient ? true : undefined);
        assert.equal(body.client_secret, publicClient ? undefined : input.clientSecret);
        return Response.json({ name: githubName, kind: "github", persistent: true, auto_refresh: true });
      });
      if (supported) assert.deepEqual(await client.setPersistentEasyOAuth(githubName, input), { persistent: true, autoRefresh: true });
      else await assert.rejects(client.setPersistentEasyOAuth(githubName, input), error => (error as { code?: string }).code === "github_oauth_persistence_required");
      assert.equal(posts, supported ? 1 : 0);
    }
  }
});

test("Drive management needs its own runtime capability before transferring any credentials", async () => {
  const input = { ...configuration(), scopes: [GOOGLE_MANAGE_SCOPE] };
  assert.equal(validatePersistentEasyOAuth(input).scopes[0], GOOGLE_MANAGE_SCOPE);
  for (const supported of [false, true]) {
    let posts = 0;
    const client = new KittiesGateway("http://127.0.0.1:7494", "fictitious-gateway-token", async (url, init) => {
      if (new URL(String(url)).pathname === "/v1/health") {
        assert.equal(init?.body, undefined);
        return Response.json({ ok: true, lexopen_persistent_oauth: "v1", ...(supported ? { lexopen_drive_management: "v1" } : {}) });
      }
      posts++; assert.equal(init?.method, "POST");
      assert.deepEqual(JSON.parse(String(init?.body)).scopes, [GOOGLE_MANAGE_SCOPE]);
      return Response.json({ name, kind: input.kind, persistent: true, auto_refresh: true });
    });
    if (supported) assert.deepEqual(await client.setPersistentEasyOAuth(name, input), { persistent: true, autoRefresh: true });
    else await assert.rejects(client.setPersistentEasyOAuth(name, input), error => (error as { code?: string }).code === "drive_management_required");
    assert.equal(posts, supported ? 1 : 0);
  }
});
