import assert from "node:assert/strict";
import { createServer } from "node:http";
import { test } from "node:test";
import { KittiesGateway } from "./gateway";
import { assertSessionLive, computerEnabled, endpointFor, inputSchema, inspectSelectedFiles, KITTIES_SOURCE_COMMIT, localSetupAllowed } from "./policy";
import { assertComputerPolicy, computerPolicyAllowed } from "./privacy";
import { computerOperationHash } from "./operation-hash";
import { createHash } from "node:crypto";

const token = "gateway-fixture-token-only";
const kitty = { id: "kitty-fixture", name: "altazor-fixture", provider: "model-fixture", desktop: true, container: "kitty-altazor-fixture", status: "running", connectors: ["-"], approvals: "ask", backup: "" };
test("manual Unicode typing is bounded by the pinned gateway's UTF-8 byte limit", () => {
  assert.equal(inputSchema.safeParse({ action: "type", args: { text: "é".repeat(1000) } }).success, true);
  assert.equal(inputSchema.safeParse({ action: "type", args: { text: "é".repeat(1001) } }).success, false);
});
test("manual-input receipts use a keyed owner/session-bound digest instead of a password dictionary", () => {
  const input = { action: "type", args: { text: "123456" } }, secret = "fictitious-computer-key-for-test-2026-with-entropy";
  const hash = computerOperationHash("owner-a", "session-a", "input", input, secret);
  assert.equal(computerOperationHash("owner-a", "session-a", "input", input, secret), hash);
  assert.notEqual(computerOperationHash("owner-b", "session-a", "input", input, secret), hash);
  assert.notEqual(computerOperationHash("owner-a", "session-b", "input", input, secret), hash);
  assert.notEqual(computerOperationHash("owner-a", "session-a", "input", input, `${secret}-rotated`), hash);
  assert.notEqual(hash, createHash("sha256").update(JSON.stringify({ kind: "input", input })).digest("hex"));
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify({ inputHash: hash }).includes('"text":'), false);
  assert.throws(() => computerOperationHash("owner-a", "session-a", "input", input, "weak"));
});
test("loopback gateway does not imply a local model or override local_only", () => {
  assert.equal(computerPolicyAllowed("local_only"), false);
  assert.throws(() => assertComputerPolicy("local_only"), error => (error as { code: string }).code === "computer_local_only");
  assertComputerPolicy("remote_allowed");
});
function fake(handler: (path: string, method: string, body: Record<string, unknown> | null) => unknown): typeof fetch {
  return (async (url, init) => {
    assert.equal(new URL(String(url)).origin, "http://127.0.0.1:7488");
    assert.equal(new Headers(init?.headers).get("Authorization"), `Bearer ${token}`);
    assert.equal(init?.redirect, "error");
    const result = handler(new URL(String(url)).pathname, init?.method || "GET", init?.body ? JSON.parse(String(init.body)) : null);
    if (result instanceof Response) return result;
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
}
test("the adapter is pinned, optional and accepts only explicit loopback endpoints", () => {
  assert.equal(KITTIES_SOURCE_COMMIT, "6aee950bdf971ff41f3867763a0ec9f5ef8ef8e3");
  assert.equal(computerEnabled({}), false); assert.equal(computerEnabled({ ALTAZOR_COMPUTER_ENABLED: "1" }), true);
  assert.equal(endpointFor("http://127.0.0.1:7488/"), "http://127.0.0.1:7488");
  for (const url of ["https://gateway.example.test", "http://localhost:7488", "http://192.168.1.2:7488", "http://127.0.0.1:7488/v1", "http://127.0.0.1:7488/?x=1", "http://token@127.0.0.1:7488", "http://127.0.0.1:80"]) assert.throws(() => endpointFor(url));
});
test("a remote browser cannot configure the Host's loopback service", () => {
  const local = { url: "http://127.0.0.1:3000/api/altazor/computer", method: "POST", headers: new Headers({ origin: "http://127.0.0.1:3000" }) };
  assert.equal(localSetupAllowed(local, { LEXOPEN_BIND: "127.0.0.1" }), true);
  assert.equal(localSetupAllowed(local, { LEXOPEN_BIND: "0.0.0.0" }), false);
  assert.equal(localSetupAllowed({ ...local, url: "https://remote.example.test/api/altazor/computer" }, { LEXOPEN_BIND: "127.0.0.1" }), false);
  assert.equal(localSetupAllowed({ ...local, headers: new Headers({ origin: "https://remote.example.test", host: "127.0.0.1:3000" }) }, { LEXOPEN_BIND: "127.0.0.1" }), false);
  assert.equal(localSetupAllowed({ ...local, headers: new Headers({ origin: "http://127.0.0.1:3000", "x-forwarded-for": "203.0.113.5" }) }, { LEXOPEN_BIND: "127.0.0.1" }), false);
  const canonicalized = { method: "POST", url: "http://localhost:3344/api/altazor/computer", headers: new Headers({ host: "127.0.0.1:3344", origin: "http://127.0.0.1:3344", "x-forwarded-for": "127.0.0.1" }) };
  assert.equal(localSetupAllowed(canonicalized, { LEXOPEN_BIND: "127.0.0.1" }), true);
  for (const host of ["evil.example:3344", "127.0.0.1:3345", "user@127.0.0.1:3344", "127.0.0.1:3344/path"]) {
    assert.equal(localSetupAllowed({ ...canonicalized, headers: new Headers({ host, origin: "http://127.0.0.1:3344" }) }, { LEXOPEN_BIND: "127.0.0.1" }), false);
  }
  assert.equal(localSetupAllowed({ ...canonicalized, headers: new Headers({ host: "127.0.0.1:3344", origin: "http://localhost:3344" }) }, { LEXOPEN_BIND: "127.0.0.1" }), false);
});
test("expired sessions and raw command inputs fail closed", () => {
  assert.throws(() => assertSessionLive({ state: "ready", expiresAt: new Date(10) }, 11));
  assert.throws(() => assertSessionLive({ state: "unknown", expiresAt: new Date(100) }, 10));
  assertSessionLive({ state: "ready", expiresAt: new Date(100) }, 10);
  assert.equal(inputSchema.safeParse({ action: "run", args: { argv: ["sh"] } }).success, false);
  assert.equal(inputSchema.safeParse({ action: "click", args: { x: 20, y: 10, hostPath: "/private" } }).success, false);
  assert.equal(inputSchema.safeParse({ action: "key", args: { keys: "Return --window 5" } }).success, false);
  assert.equal(inputSchema.safeParse({ action: "click", args: { x: 20, y: 10 } }).success, true);
});
test("files are chosen explicitly, bounded and classified from bytes", () => {
  const text = { name: "../../notice.txt", mime: "application/x-executable", data: Buffer.from("Documento ficticio de prueba").toString("base64") };
  assert.deepEqual(inspectSelectedFiles([text]), [{ ...text, name: "notice.txt", mime: "text/plain" }]);
  assert.throws(() => inspectSelectedFiles(Array.from({ length: 6 }, () => text)));
  assert.throws(() => inspectSelectedFiles([{ ...text, data: Buffer.from("MZfake executable").toString("base64") }]));
  assert.throws(() => inspectSelectedFiles([{ ...text, data: "not base64!" }]));
  assert.throws(() => inspectSelectedFiles([{ ...text, data: "" }]));
});
test("readiness rejects demo, missing containers, missing providers and foreign desktops", async () => {
  for (const change of ["demo", "no-container", "foreign", "provider"] as const) {
    const client = new KittiesGateway("http://127.0.0.1:7488", token, fake(path => {
      if (path === "/v1/health") return { ok: true, version: "fixture-version", containers: change !== "no-container" };
      if (path === "/v1/providers") return { providers: change === "provider" ? [] : [{ name: "model-fixture", kind: "openai", describe: change === "demo" ? "demo/scripted" : "fixture model" }] };
      if (path === "/v1/kitties") return { kitties: change === "foreign" ? [{ name: "another-professional" }] : [] };
      throw new Error("Unexpected endpoint");
    }));
    await assert.rejects(client.readiness("model-fixture", []));
  }
});
test("create uses the official no-connectors sentinel and bounded attended desktop", async () => {
  const paths: string[] = [];
  const client = new KittiesGateway("http://127.0.0.1:7488", token, fake((path, method, body) => {
    paths.push(path); assert.equal(method, "POST");
    if (path === "/v1/kitties") { assert.deepEqual(body?.connectors, ["-"]); assert.equal(body?.approvals, "ask"); assert.equal((body?.limits as Record<string, unknown>).attended, true); assert.equal(body?.soul_file, undefined); return { kitty }; }
    if (path === "/v1/chats") { assert.deepEqual(body?.members, [kitty.name]); return { chat: { id: "chat-fixture", members: [kitty.id], turns: [] } }; }
    throw new Error("Unexpected endpoint");
  }));
  const created = await client.createKitty(kitty.name, kitty.provider); assert.equal(await client.createChat(created), "chat-fixture");
  assert.ok(paths.every(path => !/exec|artifacts|vault|settings|local-token/.test(path)));
  const allConnectors = new KittiesGateway("http://127.0.0.1:7488", token, fake(() => ({ kitty: { ...kitty, connectors: [] } })));
  await assert.rejects(allConnectors.createKitty(kitty.name, kitty.provider));
});
test("chat projection refuses other members and excludes tool arguments, artifacts and raw metadata", async () => {
  const client = new KittiesGateway("http://127.0.0.1:7488", token, fake(() => ({ chat: { id: "chat-fixture", members: [kitty.id], turns: [{ from: kitty.name, text: "Respuesta ficticia", working: true, calls: [{ token: "must-not-leave-gateway" }], artifacts: ["global-private.md"], steps: [{ action: "type", args: { text: "private-input-fixture" }, result: "private-result-fixture", at: "2026-11-04" }] }] } })));
  const result = await client.chat("chat-fixture", kitty.id), json = JSON.stringify(result);
  assert.equal(result.working, true); assert.equal(result.turns[0].text, "Respuesta ficticia");
  for (const secret of ["must-not-leave", "global-private", "private-input", "private-result"]) assert.equal(json.includes(secret), false);
  const foreign = new KittiesGateway("http://127.0.0.1:7488", token, fake(() => ({ chat: { id: "chat-fixture", members: ["foreign-kitty"], turns: [] } })));
  await assert.rejects(foreign.chat("chat-fixture", kitty.id));
});
test("pinned GET null turns means an empty owned chat, never missing or foreign chat data", async () => {
  // Upstream Create initializes [] but Get copies it with append([]Turn(nil), empty...).
  const empty = new KittiesGateway("http://127.0.0.1:7488", token, fake(() => ({ chat: { id: "chat-fixture", members: [kitty.id], turns: null } })));
  assert.deepEqual(await empty.chat("chat-fixture", kitty.id), { working: false, turns: [] });
  await assert.rejects(empty.createChat(kitty), error => (error as { code?: string }).code === "chat_contract");
  const wrongId = new KittiesGateway("http://127.0.0.1:7488", token, fake(() => ({ chat: { id: "other-chat", members: [kitty.id], turns: null } })));
  await assert.rejects(wrongId.chat("chat-fixture", kitty.id), error => (error as { code?: string }).code === "chat_contract");
  for (const turns of [undefined, {}, "", 0, false]) {
    const malformed = new KittiesGateway("http://127.0.0.1:7488", token, fake(() => ({ chat: { id: "chat-fixture", members: [kitty.id], ...(turns === undefined ? {} : { turns }) } })));
    await assert.rejects(malformed.chat("chat-fixture", kitty.id), error => (error as { code?: string }).code === "chat_contract");
  }
  for (const members of [[], ["foreign-kitty"], [kitty.id, "foreign-kitty"]]) {
    const foreign = new KittiesGateway("http://127.0.0.1:7488", token, fake(() => ({ chat: { id: "chat-fixture", members, turns: null } })));
    await assert.rejects(foreign.chat("chat-fixture", kitty.id), error => (error as { code?: string }).code === "chat_contract");
  }
});
test("mutation transport never retries an ambiguous request", async () => {
  let mutations = 0;
  const client = new KittiesGateway("http://127.0.0.1:7488", token, fake((path, method) => {
    if (path === "/v1/health" && method === "GET") return { ok: true, lexopen_async_messages: "v1" };
    mutations++; throw new Error("fixture interrupted after request");
  }));
  await assert.rejects(client.send("chat-fixture", "Tarea ficticia", [], "action-fixture"), error => (error as { code: string }).code === "gateway_outcome_unknown");
  assert.equal(mutations, 1);
});
test("task delivery requires the async capability and never falls back to synchronous messages", async () => {
  for (const capability of [undefined, true, "v2", "V1"]) {
    let mutations = 0;
    const client = new KittiesGateway("http://127.0.0.1:7488", token, fake((path, method) => {
      if (path === "/v1/health" && method === "GET") return { ok: true, lexopen_async_messages: capability };
      mutations++; throw new Error("No task may leave for a legacy gateway");
    }));
    await assert.rejects(client.send("chat-fixture", "Tarea ficticia", [], "action-fixture"), error => (error as { code: string }).code === "async_messages_required");
    assert.equal(mutations, 0);
  }
});
test("async acceptance binds the durable action and chat without waiting for model completion", async () => {
  const file = { name: "fixture.txt", mime: "text/plain", data: Buffer.from("Fictitious selected bytes").toString("base64") };
  let posts = 0;
  const client = new KittiesGateway("http://127.0.0.1:7488", token, fake((path, method, body) => {
    if (path === "/v1/health") return { ok: true, lexopen_async_messages: "v1" };
    assert.equal(path, "/v1/chats/chat-fixture/messages/async"); assert.equal(method, "POST");
    assert.deepEqual(body, { text: "Encargo ficticio", files: [file], request_id: "action-fixture" }); posts++;
    return Response.json({ request_id: "action-fixture", chat_id: "chat-fixture", status: "accepted", state: "running" }, { status: 202 });
  }));
  assert.deepEqual(await client.send("chat-fixture", "Encargo ficticio", [file], "action-fixture"), { accepted: true, requestId: "action-fixture" });
  assert.equal(posts, 1);
});
test("a mismatched or malformed async receipt remains uncertain without a second POST", async () => {
  const receipt = { request_id: "action-fixture", chat_id: "chat-fixture", status: "accepted" };
  const variants = [
    Response.json(receipt, { status: 200 }),
    Response.json({ ...receipt, request_id: "other-action" }, { status: 202 }),
    Response.json({ ...receipt, chat_id: "other-chat" }, { status: 202 }),
    Response.json({ ...receipt, status: "completed" }, { status: 202 }),
    Response.json(null, { status: 202 }),
    Response.json([receipt], { status: 202 }),
    new Response("not JSON", { status: 202, headers: { "Content-Type": "application/json" } }),
    new Response(JSON.stringify(receipt), { status: 202, headers: { "Content-Type": "text/plain" } }),
  ];
  for (const response of variants) {
    let posts = 0;
    const client = new KittiesGateway("http://127.0.0.1:7488", token, fake(path => {
      if (path === "/v1/health") return { ok: true, lexopen_async_messages: "v1" };
      posts++; return response;
    }));
    await assert.rejects(client.send("chat-fixture", "Encargo ficticio", [], "action-fixture"), error => (error as { code: string }).code === "gateway_receipt_unknown");
    assert.equal(posts, 1);
  }
});
test("readiness contract works against a synthetic loopback HTTP server", async t => {
  const server = createServer((request, response) => {
    assert.equal(request.headers.authorization, `Bearer ${token}`);
    response.setHeader("Content-Type", "application/json");
    const fixtures: Record<string, unknown> = { "/v1/health": { ok: true, containers: true, version: "synthetic-contract-fixture" }, "/v1/providers": { providers: [{ name: "model-fixture", kind: "openai", describe: "Synthetic provider fixture" }] }, "/v1/kitties": { kitties: [] } };
    response.end(JSON.stringify(fixtures[request.url || ""] || {}));
  });
  try { await new Promise<void>((resolve, reject) => { server.once("error", reject); server.listen(0, "127.0.0.1", resolve); }); }
  catch (error) { if (["EPERM", "EACCES"].includes((error as { code: string }).code)) { t.skip("The environment does not permit a loopback listener"); return; } throw error; }
  try {
    const address = server.address(); assert.ok(address && typeof address !== "string");
    const client = new KittiesGateway(`http://127.0.0.1:${address.port}`, token);
    assert.deepEqual(await client.readiness("model-fixture", []), { version: "synthetic-contract-fixture", connectorGate: false, persistentOAuth: false, cloudFileOAuth: false });
  } finally { server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
});
