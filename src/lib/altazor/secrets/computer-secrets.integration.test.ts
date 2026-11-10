/** Complete Computer↔Secretos contract; disposable PG, synthetic gateway, no external traffic. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { configureComputer, controlComputer, createComputerSession, inputComputer, prepareComputerSecret, readComputerSession, typeComputerSecret } from "@/lib/altazor/computer/service";
import { createSecret, deleteSecret, getSecret, listSecrets, rotateSecret } from "./service";
import type { PrepareSecretUseInput, SecretTarget } from "./policy";

type Kitty = { id: string; name: string; provider: string; desktop: boolean; container: string; status: string; connectors: string[]; approvals: string; backup: string; auto_off_minutes?: number };
const hasStatus = (status: number) => (error: unknown) => (error as { status?: number }).status === status;
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  process.env.ALTAZOR_COMPUTER_ENABLED = "1";
  const tag = randomUUID(), users: string[] = [], workspaces: string[] = [];
  const originalFetch = globalThis.fetch, fleet: Kitty[] = [], chats: { id: string; members: string[]; turns: { from: string; text: string }[] }[] = [];
  const secretValue = `fictitious-bridge-password-${tag}`;
  let typed = 0, clicks = 0, enterKeys = 0, taskMessages = 0, releaseControls = 0, held = false;
  let pauseNextType: (() => Promise<void>) | undefined;
  globalThis.fetch = (async (raw, init) => {
    const target = new URL(String(raw)), path = target.pathname, method = init?.method || "GET";
    assert.equal(target.origin, "http://127.0.0.1:18845"); assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer fictitious-bridge-gateway-token");
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    if (/^\/v1\/lexopen\/chats\/[A-Za-z0-9_-]{1,100}\/computer-policy$/.test(path)) {
      assert.equal(method, "GET", "Secret fixtures do not grant computer-use permissions");
      const binding = target.searchParams.get("binding"), kittyId = target.searchParams.get("kitty");
      assert.match(binding || "", /^[a-f0-9]{64}$/); assert.match(kittyId || "", /^[A-Za-z0-9_-]{1,100}$/);
      return Response.json({ applied: false, chat_id: path.split("/")[4], kitty: kittyId, binding, mode: "supervised", revision: 0, allow_input: false, allow_browser: false, allow_apps: false, max_actions: 100, max_consultations: 20, actions_used: 0, consultations_used: 0, outcome_unknown: false });
    }
    let result: unknown;
    if (path === "/v1/health") result = { ok: true, version: "synthetic-bridge-contract", containers: true, lexopen_async_messages: "v1", lexopen_computer_use_policy: "v1" };
    else if (path === "/v1/providers") result = { providers: [{ name: "fixture-model", kind: "openai", describe: "Synthetic provider" }] };
    else if (path === "/v1/kitties" && method === "GET") result = { kitties: fleet };
    else if (path === "/v1/kitties" && method === "POST") {
      assert.deepEqual(body.connectors, ["-"]); assert.equal(body.approvals, "ask");
      const kitty: Kitty = { auto_off_minutes: 0, id: `kitty-${fleet.length}`, name: String(body.name), provider: String(body.provider), desktop: true, container: `container-${body.name}`, status: "starting", connectors: ["-"], approvals: "ask", backup: "" };
      fleet.push(kitty); result = { kitty };
    } else if (path === "/v1/chats" && method === "POST") {
      const kitty = fleet.find(row => row.name === (body.members as string[])[0]); assert.ok(kitty);
      const chat = { id: `chat-${chats.length}`, members: [kitty.id], turns: [] }; chats.push(chat); result = { chat };
    } else if (/^\/v1\/kitties\/[\w-]+$/.test(path)) result = { kitty: fleet.find(row => row.id === path.split("/").pop()) };
    else if (/^\/v1\/chats\/[\w-]+$/.test(path)) result = { chat: chats.find(row => row.id === path.split("/").pop()) };
    else if (path.endsWith("/start")) result = { kitty: fleet.find(row => row.id === path.split("/")[3]) };
    else if (path.endsWith("/control")) { held = body.hold === true; if (!held) releaseControls++; result = { held }; }
    else if (path.endsWith("/input")) {
      assert.equal(held, true);
      if (body.action === "type") {
        typed++; assert.equal((body.args as { text: string }).text, secretValue);
        const pause = pauseNextType; pauseNextType = undefined; if (pause) await pause();
      } else if (body.action === "click") clicks++;
      else if (body.action === "key") { if (/return|enter/i.test(String((body.args as { keys: string }).keys))) enterKeys++; }
      else assert.fail("Unexpected input action in fixture");
      result = { ok: true };
    } else if (path.endsWith("/messages/async")) {
      taskMessages++;
      return Response.json({ request_id: body.request_id, chat_id: path.split("/")[3], status: "accepted", state: "accepted" }, { status: 202 });
    }
    else throw new Error("Unexpected synthetic bridge endpoint");
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const owner = await prisma.user.create({ data: { name: "Bridge fixture owner", email: `${tag}@bridge.invalid`, role: "abogado", password: "not-a-login" } }); users.push(owner.id);
    const outsider = await prisma.user.create({ data: { name: "Bridge fixture outsider", email: `${tag}-other@bridge.invalid`, role: "abogado", password: "not-a-login" } }); users.push(outsider.id);
    const configured = await configureComputer(owner, { endpoint: "http://127.0.0.1:18845", token: "fictitious-bridge-gateway-token", provider: "fixture-model", dedicated: true }); assert.ok(configured.workspaceId); workspaces.push(configured.workspaceId);
    const session = await createComputerSession(owner, configured.workspaceId, `session-${tag}`); assert.equal(session.state, "starting");
    fleet[0].status = "running";
    assert.equal((await readComputerSession(owner, session.id)).session.state, "ready");
    assert.equal((await prisma.altazorComputerSession.findUniqueOrThrow({ where: { id: session.id } })).state, "ready", "Polling must persist starting→ready before Secretos can use the session");
    await controlComputer(owner, session.id, `hold-${tag}`, true);
    const created = await createSecret(owner, { requestId: `secret-${tag}`, name: "Acceso ficticio", provider: "Portal ficticio", kind: "password", value: secretValue });
    assert.equal((await listSecrets(owner)).some(row => row.id === created.secret.id), true);
    assert.equal("value" in await getSecret(owner, created.secret.id), false);
    const target: SecretTarget = { sessionId: session.id, origin: "https://portal.example.invalid", field: "password", fieldLabel: "Campo declarado por persona" };
    const prepare = async (label: string) => {
      const input = { action: "prepare", requestId: `${label}-${tag}`, secretId: created.secret.id, revision: 1, target, confirmed: true as const };
      return prepareComputerSecret(owner, session.id, input as PrepareSecretUseInput);
    };
    const first = await prepare("prepare-first");
    const typedInput = { grantId: first.id, target, confirmed: true as const };
    const simultaneous = await Promise.all([typeComputerSecret(owner, session.id, typedInput), typeComputerSecret(owner, session.id, typedInput)]);
    assert.equal(typed, 1); assert.ok(simultaneous.some(result => result.state === "used")); assert.equal(held, true);
    await typeComputerSecret(owner, session.id, typedInput); assert.equal(typed, 1);
    await assert.rejects(typeComputerSecret(outsider, session.id, typedInput), hasStatus(404)); assert.equal(typed, 1);
    const wrongSession = { ...target, sessionId: "different-session" };
    await assert.rejects(typeComputerSecret(owner, session.id, { ...typedInput, target: wrongSession }), hasStatus(409));
    const focus = await prepare("prepare-focus");
    await delay(2); await inputComputer(owner, session.id, `click-focus-${tag}`, { action: "click", args: { x: 20, y: 20 } });
    await assert.rejects(typeComputerSecret(owner, session.id, { grantId: focus.id, target, confirmed: true }), hasStatus(409)); assert.equal(typed, 1);
    const expired = await prepare("prepare-expired");
    await prisma.altazorSecretGrant.update({ where: { id: expired.id }, data: { expiresAt: new Date(0) } });
    await assert.rejects(typeComputerSecret(owner, session.id, { grantId: expired.id, target, confirmed: true }), hasStatus(409)); assert.equal(typed, 1);
    const resumed = await prepare("prepare-resumed");
    await controlComputer(owner, session.id, `resume-${tag}`, false);
    await assert.rejects(typeComputerSecret(owner, session.id, { grantId: resumed.id, target, confirmed: true }), hasStatus(409)); assert.equal(typed, 1);
    await controlComputer(owner, session.id, `rehold-${tag}`, true);
    // While typing, normal click and resume operations must wait for the session lock.
    for (const operation of ["click", "resume"] as const) {
      const pending = await prepare(`prepare-concurrent-${operation}`);
      let entered!: () => void, release!: () => void;
      const started = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
      pauseNextType = async () => { entered(); await gate; };
      const typing = typeComputerSecret(owner, session.id, { grantId: pending.id, target, confirmed: true });
      await started;
      const beforeClicks = clicks, beforeRelease = releaseControls;
      let finished = false;
      const concurrent = (operation === "click" ? inputComputer(owner, session.id, `concurrent-click-${tag}`, { action: "click", args: { x: 40, y: 40 } }) : controlComputer(owner, session.id, `concurrent-resume-${tag}`, false)).then(result => { finished = true; return result; });
      try { await delay(50); assert.equal(finished, false); assert.equal(clicks, beforeClicks); assert.equal(releaseControls, beforeRelease); } finally { release(); }
      assert.equal((await typing).state, "used"); assert.equal((await concurrent).status, "completed");
      if (operation === "resume") assert.equal(held, false); else assert.equal(held, true);
    }
    assert.equal(typed, 3); assert.equal(enterKeys, 0); assert.equal(taskMessages, 0);
    const transcript = await readComputerSession(owner, session.id);
    const actions = await prisma.altazorComputerAction.findMany({ where: { ownerId: owner.id } });
    const grants = await prisma.altazorSecretGrant.findMany({ where: { ownerId: owner.id } });
    const receipts = await prisma.altazorSecretReceipt.findMany({ where: { ownerId: owner.id } });
    assert.equal(JSON.stringify({ transcript, actions, grants, receipts }).includes(secretValue), false);
    const rotated = await rotateSecret(owner, created.secret.id, { requestId: `rotate-${tag}`, revision: 1, name: "Acceso ficticio renovado", provider: "Portal ficticio", kind: "password", value: "replacement-fictitious-value" });
    await deleteSecret(owner, created.secret.id, { requestId: `delete-${tag}`, revision: rotated.secret.revision, confirmed: true });
    assert.equal(await prisma.altazorSecret.count({ where: { ownerId: owner.id } }), 0);
    console.log("Computer + Secretos disposable integration PASS: starting→ready, private CRUD, manual hold, one typing, no Enter/transcript/receipt value, foreign/changed/expired/resumed denial, concurrent click/resume serialized. Synthetic only.");
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.altazorSecretGrant.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorSecret.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorSecretReceipt.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorComputerAction.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorComputerSession.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorComputerWorkspace.deleteMany({ where: { id: { in: workspaces } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }
}
main().catch(() => { console.error("Falló el flujo sintético Computer + Secretos; no se imprimen errores ni valores del vault."); process.exitCode = 1; });
