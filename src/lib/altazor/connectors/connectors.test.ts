import assert from "node:assert/strict";
import { test } from "node:test";
import { CONNECTOR_CATALOG } from "./catalog";
import { normalizeConnectorNames, projectConnectorSettings, validateConnectorConfiguration } from "./policy";
import { KittiesGateway } from "../computer/gateway";
import { connectorFieldPresentation } from "./presentation";

const endpoint = "http://127.0.0.1:55444", token = "fictitious-gateway-authorization-for-tests";
const catalog = CONNECTOR_CATALOG.map(kind => ({ name: kind.id, fields: kind.fieldNames.map(name => ({ name, label: name, secret: /token|secret|password/.test(name), required: false })) }));
const settings = () => ({ connector_catalog: catalog, connectors: [{ name: "correo", kind: "google-workspace", signed_in: true, needs_sign_in: false, settings: { oauth_access_token: "must-not-leave", client_secret: "private-app-key", url: "private-url-value" }, secrets_set: ["client_secret", "oauth_access_token"], used_by: ["altazor-fixture"], account: "private-person-account", auth: "sign-in" }], accounts: [{ access_token: "must-not-leave-model-key" }] });
function fake(handle: (path: string, method: string, body: Record<string, unknown> | undefined) => unknown): typeof fetch {
  return async (input, init) => {
    const url = new URL(String(input)); assert.equal(url.origin, endpoint); assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${token}`);
    return Response.json(handle(url.pathname + url.search, init?.method || "GET", init?.body ? JSON.parse(String(init.body)) : undefined));
  };
}
test("the 48 adapters are explicit; empty connector selection never means all", () => {
  assert.equal(CONNECTOR_CATALOG.length, 48); assert.equal(new Set(CONNECTOR_CATALOG.map(kind => kind.id)).size, 48);
  assert.deepEqual(normalizeConnectorNames(), ["-"]); assert.deepEqual(normalizeConnectorNames(["trabajo", "correo"]), ["correo", "trabajo"]);
  for (const input of [[], ["-", "correo"], ["correo", "correo"], ["../settings"]]) assert.throws(() => normalizeConnectorNames(input));
});
test("connector metadata never returns account keys, arbitrary settings, URLs or model credentials", () => {
  const value = projectConnectorSettings(settings()), json = JSON.stringify(value);
  for (const forbidden of ["must-not-leave", "private-app-key", "private-url-value", "private-person-account", "oauth_access_token"]) assert.equal(json.includes(forbidden), false);
  assert.equal(value.connections[0].configured, true); assert.deepEqual(value.connections[0].secretFields, ["client_secret"]);
  assert.equal(value.catalog.find(kind => kind.id === "google-workspace")?.available, true);
  assert.throws(() => projectConnectorSettings({ connectors: [], connector_catalog: null }));
  assert.throws(() => projectConnectorSettings({ ...settings(), connectors: [{ name: "bad", kind: "invented" }] }));
});
test("OAuth readiness comes from the gateway and Mac apps need an attested native Mac gateway", () => {
  const raw = { ...settings(), oauth_ready: ["google"] };
  const linux = projectConnectorSettings(raw, "linux");
  assert.equal(linux.catalog.find(kind => kind.id === "google-workspace")?.oauthReady, true);
  assert.equal(linux.catalog.find(kind => kind.id === "github")?.oauthReady, false);
  assert.equal(linux.catalog.find(kind => kind.id === "apple")?.available, false);
  assert.equal(projectConnectorSettings(raw, "darwin").catalog.find(kind => kind.id === "apple")?.available, true);
  assert.equal(projectConnectorSettings(raw).catalog.find(kind => kind.id === "apple")?.available, false);
});
test("Dropbox is offered only by gateways with read-only protection and pending writes cannot be approved", async () => {
  let hardened = false, writes = 0;
  const client = new KittiesGateway(endpoint, token, fake((path, method) => {
    if (path === "/v1/health") return { ok: true, lexopen_connector_gate: "v1", lexopen_dropbox_read_gate: hardened };
    if (path === "/v1/settings") return settings();
    if (path === "/v1/approvals?status=pending") return { approvals: [{ id: "approval-dropbox", kitty: "kitty-a", chat: "chat-a", connector: "files", kind: "dropbox", action: "request", args: { path: "/2/files/delete_v2" }, status: "pending" }] };
    if (method === "POST") writes++;
    throw new Error("Unexpected gateway request");
  }));
  const getDropbox = async () => (await client.connectorSettings()).catalog.find(kind => kind.id === "dropbox");
  assert.equal((await getDropbox())?.available, false);
  hardened = true;
  assert.equal((await getDropbox())?.available, true);
  assert.deepEqual((await getDropbox())?.actions, ["list", "search", "read"]);
  await assert.rejects(() => client.decideApproval("approval-dropbox", "kitty-a", "chat-a", ["files"], true), /sólo permite/);
  assert.equal(writes, 0);
});
test("Dropbox sign-in only uses the guided flow and rejects legacy OAuth and PUT sign-in", async () => {
  let writes = 0;
  const client = new KittiesGateway(endpoint, token, fake((path, method) => {
    if (path === "/v1/settings" && method === "GET") return { ...settings(), oauth_ready: ["dropbox"], connectors: [{ name: "private-files", kind: "dropbox", settings: { client_id: "legacy-app" }, needs_sign_in: true }] };
    if (method !== "GET") writes++;
    throw new Error("Legacy Dropbox sign-in reached the gateway");
  }));
  const dropbox = CONNECTOR_CATALOG.find(kind => kind.id === "dropbox");
  assert.equal(dropbox?.oauth, "");
  assert.deepEqual(dropbox?.fieldNames, ["token"]);
  await assert.rejects(() => client.connectorOAuth("private-files"), /Use Conectar Dropbox/);
  await assert.rejects(() => client.setConnector("private-files", { kind: "dropbox", settings: { token: "fictitious" }, signIn: true }), /Use Conectar Dropbox/);
  assert.throws(() => validateConnectorConfiguration({ kind: "dropbox", settings: { client_id: "legacy-app" } }));
  assert.deepEqual(validateConnectorConfiguration({ kind: "dropbox", settings: { token: "fictitious" }, signIn: false }).settings, { token: "fictitious" });
  assert.equal(writes, 0);
});
test("only pinned configuration fields are accepted and Host programs are blocked", () => {
  assert.equal(validateConnectorConfiguration({ kind: "github", settings: { token: "fictitious", repo: "owner/project" } }).kind, "github");
  assert.throws(() => validateConnectorConfiguration({ kind: "github", settings: { oauth_access_token: "not-allowed" } }));
  assert.throws(() => validateConnectorConfiguration({ kind: "shell", settings: { command: "/bin/echo" } }));
  assert.throws(() => validateConnectorConfiguration({ kind: "github", settings: { token: "x".repeat(6001) } }));
  assert.throws(() => validateConnectorConfiguration({ kind: "github", settings: { token: "x" }, rawProxy: "/exec" }));
});
test("Google accepts a temporary read-only token without an OAuth app and projects metadata only", () => {
  const value = validateConnectorConfiguration({ kind: "google-workspace", settings: { token: "fictitious-google-token-never-projected" } });
  assert.equal(value.kind, "google-workspace");
  const projected = projectConnectorSettings({ connector_catalog: catalog, connectors: [{ name: "google-lectura", kind: "google-workspace", signed_in: false, needs_sign_in: false, settings: { token: value.settings.token }, secrets_set: ["token"], token_set: true, auth: "token" }] });
  const connection = projected.connections[0];
  assert.equal(connection.configured, true); assert.equal(connection.needsSignIn, false); assert.equal(connection.ownAppConfigured, false); assert.equal(connection.signedIn, false); assert.equal(connection.auth, "token"); assert.deepEqual(connection.secretFields, ["token"]);
  assert.equal(JSON.stringify(projected).includes(value.settings.token), false);
  const field = projected.catalog.find(kind => kind.id === "google-workspace")?.fields.find(field => field.name === "token");
  assert.equal(field?.secret, true);
  assert.match(connectorFieldPresentation("google-workspace", field!).help!, /drive.metadata.readonly/);
  assert.equal(connectorFieldPresentation("google-workspace", field!).help!.includes("gmail.metadata"), false);
  const oldCatalog = catalog.map(kind => kind.name === "google-workspace" ? { ...kind, fields: kind.fields.filter(field => field.name !== "token") } : kind);
  assert.equal(projectConnectorSettings({ connector_catalog: oldCatalog, connectors: [] }).catalog.find(kind => kind.id === "google-workspace")?.fields.some(field => field.name === "token"), false);
});
test("connector methods use official fixed paths and project every settings response", async () => {
  const seen: string[] = [];
  const client = new KittiesGateway(endpoint, token, fake((path, method, body) => {
    seen.push(`${method} ${path}`);
    if (path.endsWith("/test")) return { ok: false, tested: true, error: "private upstream token must-not-leave" };
    if (method === "PUT") { assert.deepEqual(body, { kind: "github", settings: { token: "fictitious" } }); }
    return settings();
  }));
  const result = await client.setConnector("github", { kind: "github", settings: { token: "fictitious" }, signIn: true });
  assert.equal(JSON.stringify(result).includes("must-not-leave"), false);
  assert.deepEqual(await client.testConnector("github"), { ok: false, tested: true });
  await client.removeConnector("github");
  assert.deepEqual(seen, ["PUT /v1/settings/connectors/github?sign_in=1", "POST /v1/settings/connectors/github/test", "DELETE /v1/settings/connectors/github"]);
  await assert.rejects(() => client.setConnector("../exec", { kind: "github", settings: {} }));
});
test("a real unpatched gateway cannot enable connectors", async () => {
  const client = new KittiesGateway(endpoint, token, fake(() => ({ ok: true, containers: true, version: "0.35.0" })));
  await assert.rejects(() => client.requireConnectorGate(), /refuerzo/);
  await assert.rejects(() => client.createKitty("altazor-fixture", "fixture", ["correo"], false), /refuerzo/);
});
test("approval details preserve complete supported content and cannot authorize hidden or truncated payloads", async () => {
  let args: Record<string, unknown> = { text: "a".repeat(4000), recipients: Array.from({ length: 31 }, (_, i) => `fictitious-${i}@example.invalid`) }, posts = 0;
  const client = new KittiesGateway(endpoint, token, fake((path, method) => {
    if (path === "/v1/health") return { ok: true, lexopen_connector_gate: "v1" };
    if (method === "POST") { posts++; throw new Error("Should never post unreviewable approval"); }
    return { approvals: [{ id: "approval-fixture", kitty: "kitty-fixture", chat: "chat-fixture", connector: "correo", kind: "email", action: "send", args, status: "pending" }] };
  }));
  let projected = await client.pendingApprovals("kitty-fixture", "chat-fixture", ["correo"]);
  assert.equal(projected[0].reviewable, true); assert.deepEqual(projected[0].args, args);
  args = { password: "never-return-this-value" };
  projected = await client.pendingApprovals("kitty-fixture", "chat-fixture", ["correo"]);
  assert.equal(projected[0].reviewable, false); assert.equal(JSON.stringify(projected).includes("never-return-this-value"), false);
  await assert.rejects(() => client.decideApproval("approval-fixture", "kitty-fixture", "chat-fixture", ["correo"], true), /datos ocultos/);
  args = { recipients: Array.from({ length: 201 }, () => "example.invalid") };
  await assert.rejects(() => client.decideApproval("approval-fixture", "kitty-fixture", "chat-fixture", ["correo"], true), /límite/);
  assert.equal(posts, 0);
});
test("OAuth is constrained to the official provider and dedicated callback", async () => {
  let evil = false;
  const client = new KittiesGateway(endpoint, token, fake(path => path === "/v1/settings" ? settings() : { url: `${evil ? "https://evil.invalid" : "https://accounts.google.com"}/o/oauth2/v2/auth?state=fictitious&redirect_uri=${encodeURIComponent(endpoint + "/v1/oauth/callback")}`, redirect: endpoint + "/v1/oauth/callback" }));
  assert.match((await client.connectorOAuth("correo")).url, /^https:\/\/accounts.google.com/);
  evil = true; await assert.rejects(() => client.connectorOAuth("correo"), /ingreso/);
});
test("pending approvals are bound to kitty, chat and selected connection; permanent approval is never sent", async () => {
  const owned = { id: "approval-a", kitty: "kitty-a", chat: "chat-a", connector: "correo", kind: "google-workspace", action: "send_mail", args: { to: "example@invalid.test", text: "Borrador de prueba", headers: { Authorization: "must-not-leave" } } as Record<string, unknown>, summary: "Enviar el borrador de prueba", status: "pending", at: "2026-11-04T00:00:00Z" };
  let decisions = 0;
  const client = new KittiesGateway(endpoint, token, fake((path, method, body) => {
    if (path === "/v1/health") return { ok: true, lexopen_connector_gate: "v1" };
    if (path === "/v1/approvals?status=pending") return { approvals: [owned, { ...owned, id: "foreign-kitty", kitty: "kitty-b" }, { ...owned, id: "foreign-chat", chat: "chat-b" }, { ...owned, id: "other-connector", connector: "private" }] };
    decisions++; assert.equal(method, "POST"); assert.deepEqual(body, { always: false });
    return { approval: { ...owned, status: "approved", always: false, result: "private upstream result" } };
  }));
  const pending = await client.pendingApprovals("kitty-a", "chat-a", ["correo"]);
  assert.equal(pending.length, 1); assert.equal(JSON.stringify(pending).includes("must-not-leave"), false);
  await assert.rejects(() => client.decideApproval("approval-a", "kitty-a", "chat-a", ["correo"], true), /datos ocultos/);
  assert.equal(decisions, 0);
  owned.args = { to: "example@invalid.test", text: "Borrador de prueba" };
  const decided = await client.decideApproval("approval-a", "kitty-a", "chat-a", ["correo"], true);
  assert.equal(decided.id, "approval-a"); assert.equal(decided.status, "approved"); assert.equal(decided.failed, false);
  assert.equal(decided.canContinue, false); assert.equal(decided.resumeTask, null);
  assert.doesNotMatch(JSON.stringify(decided), /private upstream result|must-not-leave/);
  await assert.rejects(() => client.decideApproval("foreign-chat", "kitty-a", "chat-a", ["correo"], true)); assert.equal(decisions, 1);
});
test("an ambiguous PUT with credentials is never retried and its error contains no payload", async () => {
  let calls = 0;
  const client = new KittiesGateway(endpoint, token, async () => { calls++; throw new Error("must-not-leave-key"); });
  await assert.rejects(() => client.setConnector("github", { kind: "github", settings: { token: "must-not-leave-key" } }), error => String(error).includes("No se repetirá") && !String(error).includes("must-not-leave-key"));
  assert.equal(calls, 1);
});
