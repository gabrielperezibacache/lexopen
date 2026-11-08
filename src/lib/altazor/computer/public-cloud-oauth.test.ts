import assert from "node:assert/strict";
import { test } from "node:test";
import { KittiesGateway } from "./gateway";
import type { PersistentEasyOAuthConfiguration } from "../connectors/persistent-oauth";

const configurations: PersistentEasyOAuthConfiguration[] = [
  { kind: "dropbox", clientId: "synthetic-dropbox-client", clientSecret: "", accessToken: "synthetic-access", refreshToken: "synthetic-refresh", expiresAt: new Date(Date.now() + 3600_000).toISOString(), scopes: ["account_info.read", "files.content.read", "files.metadata.read"], publicClient: true },
  { kind: "microsoft-365", clientId: "12345678-1234-1234-1234-123456789abc", clientSecret: "", accessToken: "synthetic-access", refreshToken: "synthetic-refresh", expiresAt: new Date(Date.now() + 3600_000).toISOString(), scopes: ["Files.Read", "User.Read"], publicClient: true },
];

test("public installed accounts require the cloud capability before credentials leave the application", async () => {
  for (const input of configurations) {
    const calls: string[] = [];
    const fetcher: typeof fetch = async (_url, init) => { calls.push(String(init?.method || "GET")); return Response.json({ ok: true, lexopen_persistent_oauth: "v1" }); };
    const client = new KittiesGateway("http://127.0.0.1:7494", "synthetic-token", fetcher);
    await assert.rejects(client.setPersistentEasyOAuth(`altazor-${input.kind === "dropbox" ? "dropbox" : "microsoft"}-0123456789abcdef`, input), error => (error as { code?: string }).code === "cloud_file_oauth_required");
    assert.equal(calls.includes("POST"), false);
  }
});
test("public Dropbox/Microsoft import includes no web client secret and exposes only its persistence receipt", async () => {
  for (const input of configurations) {
    const name = `altazor-${input.kind === "dropbox" ? "dropbox" : "microsoft"}-0123456789abcdef`;
    let posts = 0;
    const fetcher: typeof fetch = async (url, init) => {
      const target = new URL(String(url)); assert.equal(target.origin, "http://127.0.0.1:7494"); assert.equal(target.search, "");
      if (target.pathname === "/v1/health") return Response.json({ ok: true, lexopen_persistent_oauth: "v1", lexopen_cloud_file_oauth: "v1" });
      posts++; assert.equal(target.pathname, `/v1/lexopen/easy-oauth/${name}`); assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-token");
      const body = JSON.parse(String(init?.body)); assert.equal(body.public_client, true); assert.equal(Object.hasOwn(body, "client_secret"), false); assert.equal(body.kind, input.kind); assert.equal(body.client_id, input.clientId); assert.deepEqual(body.scopes, input.scopes);
      return Response.json({ name, kind: input.kind, persistent: true, auto_refresh: true, ignored: "never-expose" });
    };
    assert.deepEqual(await new KittiesGateway("http://127.0.0.1:7494", "synthetic-token", fetcher).setPersistentEasyOAuth(name, input), { persistent: true, autoRefresh: true }); assert.equal(posts, 1);
  }
});
test("readiness advertises public cloud imports only for the exact capability", async () => {
  for (const enabled of [false, true]) {
    const fetcher: typeof fetch = async url => {
      const path = new URL(String(url)).pathname;
      if (path === "/v1/health") return Response.json({ ok: true, containers: true, version: "fictitious-native.10", ...(enabled ? { lexopen_cloud_file_oauth: "v1" } : {}) });
      if (path === "/v1/providers") return Response.json({ providers: [{ name: "local", kind: "ollama" }] });
      if (path === "/v1/kitties") return Response.json({ kitties: [] });
      throw new Error("Unexpected fake endpoint");
    };
    assert.equal((await new KittiesGateway("http://127.0.0.1:7494", "synthetic-token", fetcher).readiness("local", [])).cloudFileOAuth, enabled);
  }
});
