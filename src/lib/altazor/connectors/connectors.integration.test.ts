/** Owned disposable PostgreSQL fixtures and an in-memory gateway; no real app account. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { closeComputerSession, configureComputer, controlComputer, createComputerSession, decideComputerApproval, readComputerSession, sendComputerMessage } from "../computer/service";
import { acknowledgeConnectorOperation, configureConnector, connectorInventory, testConnector } from "./service";
import { CONNECTOR_CATALOG } from "./catalog";

const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const tag = randomUUID(), users: string[] = [], causes: string[] = [], workspaceIds: string[] = [], beforeFetch = globalThis.fetch;
  process.env.ALTAZOR_COMPUTER_ENABLED = "1";
  let requests = 0, puts = 0, loseNextPut = false, gateReady = true, loseNextApproval = false, approvalPosts = 0, messages = 0;
  const lifecycle: string[] = [];
  const fleet: { id: string; name: string; provider: string; desktop: boolean; container: string; status: string; connectors: string[]; approvals: string; backup: string }[] = [];
  const chats = new Map<string, { id: string; members: string[]; turns: { from: string; text: string }[] }>();
  const approvals: { id: string; kitty: string; chat: string; connector: string; kind: string; action: string; args: Record<string, unknown>; summary: string; status: string; at: string; always?: boolean }[] = [];
  const configured: { name: string; kind: string; settings: Record<string, string>; secrets_set: string[]; needs_sign_in: boolean; auth: string }[] = [];
  const snapshot = () => ({ connector_catalog: CONNECTOR_CATALOG.map(kind => ({ name: kind.id, fields: kind.fieldNames.map(name => ({ name, label: name, secret: name === "token", required: false })) })), connectors: configured });
  globalThis.fetch = (async (raw, init) => {
    requests++; const target = new URL(String(raw)), path = target.pathname, method = init?.method || "GET";
    assert.equal(target.hostname, "127.0.0.1"); assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fictitious-connector-gateway-token");
    let result: unknown;
    const body = init?.body ? JSON.parse(String(init.body)) : {};
    if (path === "/v1/health") result = { ok: true, containers: true, version: "connector-fixture", lexopen_async_messages: "v1", ...(gateReady ? { lexopen_connector_gate: "v1" } : {}), lexopen_connector_platform: "linux" };
    else if (path === "/v1/providers") result = { providers: [{ name: "connector-model", kind: "openai" }] };
    else if (path === "/v1/kitties" && method === "GET") result = { kitties: fleet };
    else if (path === "/v1/kitties" && method === "POST") {
      lifecycle.push(`create:${body.start}`);
      const kitty = { id: `kitty-${fleet.length + 1}`, name: body.name, provider: body.provider, desktop: true, container: `kitty-${body.name}`, status: body.start ? "running" : "created", connectors: body.connectors, approvals: "ask", backup: "" }; fleet.push(kitty); result = { kitty };
    }
    else if (path === "/v1/chats" && method === "POST") {
      const kitty = fleet.find(row => row.name === body.members[0]); assert.ok(kitty);
      const chat = { id: `chat-${chats.size + 1}`, members: [kitty.id], turns: [] }; chats.set(chat.id, chat); result = { chat };
    }
    else if (path === "/v1/approvals/rules" && method === "POST") {
      lifecycle.push(`rule:${body.connector}`); assert.equal(body.action, "*"); assert.equal(body.mode, "ask");
      result = { rule: { id: `rule-${lifecycle.length}`, ...body } };
    }
    else if (path === "/v1/approvals") result = { approvals: approvals.filter(row => row.status === "pending") };
    else if (/^\/v1\/approvals\/[^/]+\/(approve|reject)$/.test(path)) {
      const approval = approvals.find(row => row.id === path.split("/")[3]); assert.ok(approval); assert.equal(approval.status, "pending"); assert.equal(body.always, false);
      approvalPosts++; approval.status = path.endsWith("/approve") ? "approved" : "rejected"; approval.always = false;
      if (loseNextApproval) { loseNextApproval = false; throw new Error("private lost approval fixture"); }
      result = { approval: { ...approval, result: "must-not-leave-upstream-output" } };
    }
    else if (path === "/v1/settings") result = snapshot();
    else if (path.endsWith("/test")) result = { ok: true, tested: true, account: "must-not-leave-account" };
    else if (/^\/v1\/settings\/connectors\/(github|clima)$/.test(path) && method === "PUT") {
      puts++; const name = path.split("/").pop()!;
      const value = { name, kind: body.kind, settings: body.settings, secrets_set: body.settings.token ? ["token"] : [], needs_sign_in: false, auth: body.settings.token ? "token" : "" };
      const index = configured.findIndex(row => row.name === name);
      if (index < 0) configured.push(value); else configured[index] = value;
      if (loseNextPut) { loseNextPut = false; throw new Error("private synthetic payload must-not-leave"); }
      result = snapshot();
    }
    else if (/^\/v1\/kitties\/[^/]+$/.test(path)) result = { kitty: fleet.find(row => row.id === path.split("/")[3] || row.name === path.split("/")[3]) };
    else if (/^\/v1\/kitties\/[^/]+\/start$/.test(path)) { lifecycle.push("start"); const kitty = fleet.find(row => row.id === path.split("/")[3]); assert.ok(kitty); kitty.status = "running"; result = { kitty }; }
    else if (/^\/v1\/chats\/[^/]+$/.test(path)) result = { chat: chats.get(path.split("/")[3]) };
    else if (path.endsWith("/messages/async")) {
      messages++; const chat = chats.get(path.split("/")[3]); assert.ok(chat); assert.ok(body.request_id);
      chat.turns.push({ from: "user", text: body.text }, { from: "kitty-fixture", text: "Acciones ficticias preparadas; falta autorización." });
      return Response.json({ request_id: body.request_id, chat_id: chat.id, status: "accepted" }, { status: 202 });
    }
    else if (path.endsWith("/control")) result = { held: body.hold === true };
    else if (path.endsWith("/cancel")) result = { cancelled: false };
    else if (path.endsWith("/stop")) { const kitty = fleet.find(row => row.id === path.split("/")[3]); assert.ok(kitty); kitty.status = "stopped"; result = { kitty }; }
    else throw new Error("Unexpected synthetic endpoint");
    return Response.json(result);
  }) as typeof fetch;
  try {
    const owner = await prisma.user.create({ data: { name: "Connector fixture owner", email: `${tag}@connector.invalid`, role: "abogado", password: "not-a-login" } }); users.push(owner.id);
    const outsider = await prisma.user.create({ data: { name: "Connector fixture outsider", email: `${tag}-other@connector.invalid`, role: "abogado", password: "not-a-login" } }); users.push(outsider.id);
    const cause = await prisma.causa.create({ data: { titulo: "Fictitious connector case", tribunal: "Tribunal ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); causes.push(cause.id);
    const computer = await configureComputer(owner, { causaId: cause.id, endpoint: `http://127.0.0.1:${28000 + Math.floor(Math.random() * 3000)}`, token: "fictitious-connector-gateway-token", provider: "connector-model", dedicated: true });
    assert.ok(computer.workspaceId); const workspace = computer.workspaceId; workspaceIds.push(workspace);
    const config = { kind: "github" as const, settings: { token: "fictitious-private-connector-token", repo: "fixture/example" } };
    const first = await configureConnector(owner, workspace, `configure-${tag}`, "github", config);
    assert.equal(first.operation.status, "completed"); assert.equal(puts, 1);
    await configureConnector(owner, workspace, `configure-${tag}`, "github", config); assert.equal(puts, 1);
    await assert.rejects(configureConnector(owner, workspace, `configure-${tag}`, "github", { ...config, settings: { token: "changed-fictitious" } }), status(409));
    for (const row of await prisma.altazorConnectorOperation.findMany({ where: { ownerId: owner.id } })) assert.equal(JSON.stringify(row).includes(config.settings.token), false);
    const inventory = await connectorInventory(owner, workspace);
    assert.equal(inventory.connections[0].name, "github"); assert.equal(JSON.stringify(inventory).includes(config.settings.token), false);
    assert.deepEqual(await testConnector(owner, workspace, "github"), { ok: true, tested: true });
    let networkBefore = requests;
    await assert.rejects(connectorInventory(outsider, workspace), status(404)); assert.equal(requests, networkBefore);
    await prisma.causa.update({ where: { id: cause.id }, data: { abogadoId: outsider.id } });
    networkBefore = requests; await assert.rejects(connectorInventory(owner, workspace), status(404)); assert.equal(requests, networkBefore);
    await prisma.causa.update({ where: { id: cause.id }, data: { abogadoId: owner.id } });
    loseNextPut = true;
    await assert.rejects(configureConnector(owner, workspace, `lost-${tag}`, "github", config)); assert.equal(puts, 2);
    assert.equal((await configureConnector(owner, workspace, `lost-${tag}`, "github", config)).operation.status, "unknown"); assert.equal(puts, 2);
    await assert.rejects(configureConnector(owner, workspace, `new-after-lost-${tag}`, "github", config), status(409)); assert.equal(puts, 2);
    await assert.rejects(createComputerSession(owner, workspace, `session-unknown-${tag}`), status(409));
    const lost = await prisma.altazorConnectorOperation.findUniqueOrThrow({ where: { ownerId_requestId: { ownerId: owner.id, requestId: `lost-${tag}` } } });
    await assert.rejects(acknowledgeConnectorOperation(outsider, workspace, lost.id), status(404));
    await acknowledgeConnectorOperation(owner, workspace, lost.id); assert.equal(puts, 2);
    const acknowledged = await prisma.altazorConnectorOperation.findUniqueOrThrow({ where: { id: lost.id } }); assert.equal(acknowledged.status, "acknowledged");
    const active = await prisma.altazorComputerSession.create({ data: { ownerId: owner.id, workspaceId: workspace, requestId: `active-${tag}`, kittyName: "owned-connector-fixture", state: "ready", expiresAt: new Date(Date.now() + 60_000) } });
    await assert.rejects(configureConnector(owner, workspace, `during-session-${tag}`, "github", config), status(409)); assert.equal(puts, 2);
    await prisma.altazorComputerSession.update({ where: { id: active.id }, data: { state: "closed" } });
    await configureConnector(owner, workspace, `after-session-${tag}`, "github", config); assert.equal(puts, 3);
    await configureConnector(owner, workspace, `weather-${tag}`, "clima", { kind: "weather", settings: { place: "Santiago" } });
    gateReady = false;
    await assert.rejects(createComputerSession(owner, workspace, `unpatched-${tag}`, ["github", "clima"]), status(409)); assert.equal(fleet.length, 0);
    gateReady = true;
    const session = await createComputerSession(owner, workspace, `selected-${tag}`, ["github", "clima"]);
    assert.deepEqual(session.connectors, ["clima", "github"]); assert.deepEqual(lifecycle, ["create:false", "rule:clima", "rule:github", "start"]);
    const row = await prisma.altazorComputerSession.findUniqueOrThrow({ where: { id: session.id } }); assert.ok(row.kittyId); assert.ok(row.chatId);
    const pending = (id: string, overrides: Record<string, unknown> = {}) => ({ id, kitty: row.kittyId!, chat: row.chatId!, connector: "github", kind: "github", action: "create_issue", args: { title: "Ejemplo ficticio", body: "Sin información real" }, summary: "Crear una incidencia de prueba", status: "pending", at: new Date().toISOString(), ...overrides });
    approvals.push(pending("owned-a"), pending("owned-b"), pending("foreign-chat", { chat: "chat-foreign" }), pending("foreign-name", { connector: "not-selected" }));
    await sendComputerMessage(owner, session.id, { requestId: `message-selected-${tag}`, text: "Prepara ejemplos ficticios", files: [], confirmed: true }); assert.equal(messages, 1);
    assert.equal((await readComputerSession(owner, session.id)).approvals.length, 2);
    await assert.rejects(decideComputerApproval(owner, session.id, `foreign-chat-${tag}`, "foreign-chat", true), status(409));
    await assert.rejects(decideComputerApproval(owner, session.id, `foreign-name-${tag}`, "foreign-name", true), status(409)); assert.equal(approvalPosts, 0);
    await controlComputer(owner, session.id, `hold-approval-${tag}`, true);
    await assert.rejects(decideComputerApproval(owner, session.id, `held-approval-${tag}`, "owned-a", true), status(409)); assert.equal(approvalPosts, 0);
    await controlComputer(owner, session.id, `release-approval-${tag}`, false);
    const approved = await decideComputerApproval(owner, session.id, `approve-${tag}`, "owned-a", true); assert.equal(approved.status, "completed"); assert.equal(approvalPosts, 1); assert.equal(JSON.stringify(approved).includes("must-not-leave"), false);
    await decideComputerApproval(owner, session.id, `approve-${tag}`, "owned-a", true); assert.equal(approvalPosts, 1);
    await decideComputerApproval(owner, session.id, `reject-${tag}`, "owned-b", false); assert.equal(approvalPosts, 2); assert.equal(approvals.find(row => row.id === "owned-b")?.status, "rejected");
    approvals.push(pending("owned-c")); loseNextApproval = true;
    await assert.rejects(decideComputerApproval(owner, session.id, `lost-approval-${tag}`, "owned-c", true)); assert.equal(approvalPosts, 3);
    assert.equal((await decideComputerApproval(owner, session.id, `lost-approval-${tag}`, "owned-c", true)).status, "unknown"); assert.equal(approvalPosts, 3);
    await assert.rejects(decideComputerApproval(owner, session.id, `no-new-retry-${tag}`, "owned-c", true), status(409)); assert.equal(approvalPosts, 3);
    gateReady = false;
    await assert.rejects(sendComputerMessage(owner, session.id, { requestId: `without-gate-${tag}`, text: "No debe enviarse", files: [], confirmed: true }), status(409)); assert.equal(messages, 1);
    gateReady = true; await closeComputerSession(owner, session.id, `close-selected-${tag}`);
    console.log("Connector disposable integration PASS: owner/case ACL, metadata-only settings, keyed config/approval receipts, unknown without resend, active-session config lock; explicit 2-connector session, rules before start, message, pending approvals, exact-once approve, reject, foreign chat/name denial, held denial and missing-gate fail closed. Every gateway response is fictitious.");
  } finally {
    globalThis.fetch = beforeFetch;
    await prisma.altazorConnectorOperation.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorComputerAction.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorComputerSession.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorComputerWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.causa.deleteMany({ where: { id: { in: causes } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Connector fixture failed"); process.exitCode = 1; });
