import assert from "node:assert/strict";
import test from "node:test";
import { KittiesGateway } from "../computer/gateway";
import { GOOGLE_FILES_SCOPE } from "./oauth-access";
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
