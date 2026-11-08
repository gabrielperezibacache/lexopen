/** Disposable PostgreSQL, own generated IDs and a synthetic in-memory gateway only. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { attemptContext, digest, randomToken, seal } from "@/lib/personal-connectors/core";
import { completeLinkedInOAuth, publicLinkedInAccount, receiveLinkedInCallback } from "@/lib/personal-connectors/linkedin/account";
import { cancelComputerTask, closeComputerSession, computerScreenshot, configureComputer, controlComputer, createComputerSession, inputComputer, readComputerActivity, readComputerSession, sendComputerMessage } from "./service";

type KittyFixture = { id: string; name: string; provider: string; desktop: boolean; container: string; status: string; connectors: string[]; approvals: string; backup: string };
type TurnFixture = { from: string; text: string; working?: boolean; needs_help?: boolean; steps?: { action: string }[] };
const hasStatus = (status: number) => (error: unknown) => (error as { status?: number }).status === status;
const fixtureFrame = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a7ioAAAAASUVORK5CYII=", "base64");
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const tag = randomUUID(), users: string[] = [], causes: string[] = [], workspaces: string[] = [];
  const fetchBefore = globalThis.fetch;
  Object.assign(process.env, { ALTAZOR_COMPUTER_ENABLED: "1", LINKEDIN_CLIENT_ID: `fixture-${tag}`, LINKEDIN_CLIENT_SECRET: "fictitious-client-secret", LINKEDIN_REDIRECT_URI: "https://fixture.invalid/api/personal-connectors/linkedin/oauth/callback", LINKEDIN_SHARE_ENABLED: "1" });
  const fleets = new Map<string, KittyFixture[]>(), chats = new Map<string, { id: string; members: string[]; turns: TurnFixture[] }>();
  let network = 0, mutations = 0, kittyCreates = 0, sends = 0, loseNextMessage = false;
  const acceptedRequests = new Map<string, { chatId: string; content: string }>();
  globalThis.fetch = (async (raw, init) => {
    network++; const target = new URL(String(raw)), path = target.pathname, method = init?.method || "GET";
    assert.equal(target.hostname, "127.0.0.1"); assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fictitious-gateway-token");
    assert.equal(/artifacts|\/exec|settings|vault|local-token/.test(path), false);
    if (method === "POST") mutations++;
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    const fleet = fleets.get(target.origin) || []; fleets.set(target.origin, fleet);
    if (/^\/v1\/lexopen\/chats\/[A-Za-z0-9_-]{1,100}\/computer-policy$/.test(path)) {
      assert.equal(init?.method || "GET", "GET", "legacy fixtures never grant computer-use permission");
      const binding = target.searchParams.get("binding"), kittyId = target.searchParams.get("kitty");
      assert.match(binding || "", /^[a-f0-9]{64}$/); assert.match(kittyId || "", /^[A-Za-z0-9_-]{1,100}$/);
      return Response.json({ applied: false, chat_id: path.split("/")[4], kitty: kittyId, binding, mode: "supervised", revision: 0, allow_input: false, allow_browser: false, allow_apps: false, max_actions: 100, max_consultations: 20, actions_used: 0, consultations_used: 0, outcome_unknown: false });
    }
    let result: unknown;
    if (path === "/v1/health") result = { ok: true, version: "synthetic-pg-contract", containers: true, lexopen_async_messages: "v1", lexopen_computer_use_policy: "v1" };
    else if (path === "/v1/providers") result = { providers: [{ name: "fictitious-model", kind: "openai", describe: "Synthetic model fixture" }] };
    else if (path === "/v1/kitties" && method === "GET") result = { kitties: fleet };
    else if (path === "/v1/kitties" && method === "POST") {
      kittyCreates++; assert.deepEqual(body.connectors, ["-"]); assert.equal(body.approvals, "ask");
      const kitty: KittyFixture = { id: `kitty-${kittyCreates}`, name: String(body.name), provider: String(body.provider), desktop: true, container: `kitty-${body.name}`, status: "running", connectors: ["-"], approvals: "ask", backup: "" }; fleet.push(kitty); result = { kitty };
    } else if (path === "/v1/chats" && method === "POST") {
      const member = fleet.find(kitty => kitty.name === (body.members as string[])[0]); assert.ok(member);
      const chat = { id: `chat-${chats.size + 1}`, members: [member.id], turns: [] as TurnFixture[] }; chats.set(`${target.origin}:${chat.id}`, chat); result = { chat };
    } else if (/^\/v1\/kitties\/[\w-]+$/.test(path)) result = { kitty: fleet.find(kitty => kitty.id === path.split("/").pop() || kitty.name === path.split("/").pop()) };
    else if (/^\/v1\/chats\/[\w-]+$/.test(path)) result = { chat: chats.get(`${target.origin}:${path.split("/").pop()}`) };
    else if (path.endsWith("/messages/async")) {
      sends++; const id = path.split("/")[3], chat = chats.get(`${target.origin}:${id}`); assert.ok(chat);
      assert.equal(method, "POST");
      assert.match(String(body.request_id), /^[A-Za-z0-9_-]{1,100}$/);
      const requestId = String(body.request_id), content = JSON.stringify({ text: body.text, files: body.files });
      const previous = acceptedRequests.get(requestId);
      if (previous) {
        assert.equal(previous.chatId, id); assert.equal(previous.content, content);
      } else {
        assert.equal(chat.turns.some(turn => turn.working), false, "the fixture cannot accept a second task during its first inference");
        acceptedRequests.set(requestId, { chatId: id, content });
        chat.turns.push({ from: "user", text: String(body.text) }, { from: "fixture-kitty", text: "", working: true });
      }
      if (loseNextMessage) { loseNextMessage = false; throw new Error("Synthetic response lost after acceptance"); }
      return Response.json({ request_id: requestId, chat_id: id, status: "accepted", state: "accepted" }, { status: 202 });
    } else if (path.endsWith("/screenshot")) return new Response(new Uint8Array(fixtureFrame), { headers: { "Content-Type": "image/png" } });
    else if (path.endsWith("/control")) result = { held: body.hold === true };
    else if (path.endsWith("/input")) result = { ok: true };
    else if (path.endsWith("/cancel")) {
      const chat = chats.get(`${target.origin}:${path.split("/")[3]}`); assert.ok(chat);
      const working = chat.turns.filter(turn => turn.working);
      for (const turn of working) turn.working = false;
      result = { cancelled: working.length > 0 };
    }
    else if (path.endsWith("/stop")) { const kitty = fleet.find(kitty => kitty.id === path.split("/")[3]); assert.ok(kitty); kitty.status = "stopped"; result = { kitty }; }
    else throw new Error("Unexpected fixture endpoint");
    return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    const owner = await prisma.user.create({ data: { name: "Computer fixture owner", email: `${tag}@computer.invalid`, role: "abogado", password: "not-a-login" } }); users.push(owner.id);
    const outsider = await prisma.user.create({ data: { name: "Computer fixture outsider", email: `${tag}-other@computer.invalid`, role: "abogado", password: "not-a-login" } }); users.push(outsider.id);
    const cause = await prisma.causa.create({ data: { titulo: "Fictitious computer case", tribunal: "Tribunal ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); causes.push(cause.id);
    const port = 16000 + Math.floor(Math.random() * 8000), input = { causaId: cause.id, endpoint: `http://127.0.0.1:${port}`, token: "fictitious-gateway-token", provider: "fictitious-model", dedicated: true as const };
    const configured = await configureComputer(owner, input); assert.ok(configured.workspaceId); workspaces.push(configured.workspaceId);
    assert.equal(JSON.stringify(configured).includes(input.token), false);
    await assert.rejects(configureComputer(outsider, { ...input, causaId: null }), hasStatus(409));
    const first = await createComputerSession(owner, configured.workspaceId, `start-${tag}`); assert.equal(first.state, "ready"); assert.equal(kittyCreates, 1);
    const beforeReplay = network; assert.equal((await createComputerSession(owner, configured.workspaceId, `start-${tag}`)).id, first.id); assert.equal(network, beforeReplay);
    const beforeDenied = network; await assert.rejects(readComputerSession(outsider, first.id), hasStatus(404)); await assert.rejects(computerScreenshot(outsider, first.id), hasStatus(404)); assert.equal(network, beforeDenied);
    await assert.rejects(readComputerActivity(outsider, cause.id), hasStatus(404));
    await assert.rejects(readComputerActivity(outsider, null, first.id), hasStatus(404));
    assert.equal((await readComputerActivity(owner)).sessionId, null, "the personal chat cannot discover the case desktop");
    assert.equal(network, beforeDenied, "unauthorized or unrelated activity never contacts the gateway");
    const beforePreviewWrites = mutations;
    const healthBeforePreview = await prisma.altazorComputerWorkspace.findUniqueOrThrow({ where: { id: configured.workspaceId }, select: { updatedAt: true, lastVerifiedAt: true } });
    assert.deepEqual(await readComputerActivity(owner, cause.id), { state: "ready", sessionId: first.id, monitor: true });
    assert.deepEqual(await readComputerActivity(owner, null, first.id), { state: "ready", sessionId: first.id, monitor: true, causaId: cause.id });
    const chat = [...chats.values()][0];
    const turn: TurnFixture = { from: "fixture-kitty", text: "Petición privada que no debe salir en la vista de actividad", working: true, steps: [{ action: "ask_help" }] };
    chat.turns.push(turn);
    assert.deepEqual(await readComputerActivity(owner, cause.id), { state: "help", sessionId: first.id, monitor: true });
    turn.steps?.push({ action: "helped" });
    assert.deepEqual(await readComputerActivity(owner, cause.id), { state: "working", sessionId: first.id, monitor: true });
    turn.steps?.push({ action: "run" });
    const progress = await readComputerActivity(owner, cause.id);
    assert.deepEqual(progress, { state: "working", sessionId: first.id, monitor: true, detail: { connections: [], step: { label: "Trabajando con archivos y herramientas", at: "" } } });
    assert.equal(JSON.stringify(progress).includes(turn.text), false, "passive progress does not expose the task or document contents");
    turn.steps?.pop();
    turn.working = false;
    turn.needs_help = true;
    assert.deepEqual(await readComputerActivity(owner, cause.id), { state: "help", sessionId: first.id, monitor: true });
    chat.turns.push({ from: "user", text: "Continuemos", working: true });
    assert.deepEqual(await readComputerActivity(owner, cause.id), { state: "working", sessionId: first.id, monitor: true });
    chat.turns.length = 0;
    assert.deepEqual(await computerScreenshot(owner, first.id, true), fixtureFrame);
    assert.equal(mutations, beforePreviewWrites, "watching a desktop does not operate it");
    assert.deepEqual(await prisma.altazorComputerWorkspace.findUniqueOrThrow({ where: { id: configured.workspaceId }, select: { updatedAt: true, lastVerifiedAt: true } }), healthBeforePreview);
    const manualBefore = mutations;
    await assert.rejects(inputComputer(owner, first.id, `unheld-${tag}`, { action: "type", args: { text: "fictitious manually typed text" } }), hasStatus(409)); assert.equal(mutations, manualBefore);
    await controlComputer(owner, first.id, `hold-${tag}`, true);
    const beforePaused = network;
    assert.equal((await readComputerActivity(owner, cause.id)).state, "paused");
    assert.equal((await readComputerActivity(owner, null, first.id)).state, "paused");
    await assert.rejects(computerScreenshot(owner, first.id, true), hasStatus(409));
    assert.equal(network, beforePaused, "the passive view cannot capture the manual control session");
    await inputComputer(owner, first.id, `type-${tag}`, { action: "type", args: { text: "fictitious manually typed text" } });
    const inputReceipt = await prisma.altazorComputerAction.findUniqueOrThrow({ where: { ownerId_requestId: { ownerId: owner.id, requestId: `type-${tag}` } } });
    assert.equal(JSON.stringify(inputReceipt).includes("fictitious manually typed text"), false);
    await controlComputer(owner, first.id, `release-${tag}`, false);
    const message = { requestId: `message-${tag}`, text: "Ordena sólo el archivo ficticio elegido", files: [{ name: "fixture.txt", mime: "text/plain", data: Buffer.from("Contenido público completamente ficticio").toString("base64") }], confirmed: true as const };
    const sent = await sendComputerMessage(owner, first.id, message); assert.equal(sent.status, "completed"); assert.equal(sent.result?.accepted, true); assert.equal(sends, 1);
    assert.equal(acceptedRequests.size, 1);
    assert.equal(acceptedRequests.has(sent.id), true, "the durable gateway request is bound to the claimed broker action");
    assert.equal(acceptedRequests.has(message.requestId), false, "the browser's submission key is not used as the gateway receipt id");
    assert.equal((await readComputerSession(owner, first.id)).turns.at(-1)?.working, true, "delivery completes while the first inference is still pending");
    assert.equal((await readComputerSession(owner, first.id)).turns.at(-1)?.text, "", "acceptance is not a fabricated model result");
    await sendComputerMessage(owner, first.id, message); assert.equal(sends, 1);
    await assert.rejects(sendComputerMessage(owner, first.id, { ...message, text: "Contenido diferente" }), hasStatus(409));
    await assert.rejects(sendComputerMessage(owner, first.id, { ...message, requestId: `busy-${tag}` }), hasStatus(409)); assert.equal(sends, 1);
    await controlComputer(owner, first.id, `hold-first-inference-${tag}`, true);
    assert.equal((await readComputerSession(owner, first.id)).session.held, true, "manual control does not wait for the pending inference");
    await controlComputer(owner, first.id, `release-first-inference-${tag}`, false);
    const cancelled = await cancelComputerTask(owner, first.id, `cancel-first-inference-${tag}`);
    assert.equal(cancelled.status, "completed"); assert.equal(cancelled.result?.cancelled, true);
    assert.equal((await readComputerSession(owner, first.id)).turns.at(-1)?.working, false);
    const continued = { ...message, requestId: `continued-${tag}`, text: "Continuación ficticia tras cancelar", files: [] };
    assert.equal((await sendComputerMessage(owner, first.id, continued)).status, "completed"); assert.equal(sends, 2);
    const completedTurn = chat.turns.at(-1)!;
    completedTurn.working = false; completedTurn.text = "Resultado completamente ficticio";
    assert.equal((await readComputerSession(owner, first.id)).turns.at(-1)?.text, "Resultado completamente ficticio");
    loseNextMessage = true;
    const ambiguous = { ...message, requestId: `lost-${tag}`, text: "Tarea ficticia con respuesta perdida", files: [] };
    await assert.rejects(sendComputerMessage(owner, first.id, ambiguous)); assert.equal(sends, 3);
    assert.equal((await sendComputerMessage(owner, first.id, ambiguous)).status, "unknown"); assert.equal(sends, 3);
    await assert.rejects(sendComputerMessage(owner, first.id, { ...ambiguous, requestId: `must-not-resend-${tag}` }), hasStatus(409)); assert.equal(sends, 3);
    const beforeRevoked = network;
    await prisma.causa.update({ where: { id: cause.id }, data: { abogadoId: outsider.id } });
    await assert.rejects(readComputerActivity(owner, cause.id), hasStatus(404));
    await assert.rejects(readComputerActivity(owner, null, first.id), hasStatus(404));
    await assert.rejects(computerScreenshot(owner, first.id, true), hasStatus(404));
    await assert.rejects(readComputerSession(owner, first.id), hasStatus(404)); await assert.rejects(controlComputer(owner, first.id, `revoked-${tag}`, true), hasStatus(404)); assert.equal(network, beforeRevoked);
    await prisma.causa.update({ where: { id: cause.id }, data: { abogadoId: owner.id } });
    await closeComputerSession(owner, first.id, `close-${tag}`);
    assert.deepEqual(await readComputerActivity(owner, null, first.id), { state: "idle", sessionId: null, monitor: true, causaId: cause.id });
    const next = await createComputerSession(owner, configured.workspaceId, `second-${tag}`);
    await prisma.altazorComputerSession.update({ where: { id: next.id }, data: { expiresAt: new Date(0) } }); const beforeExpired = network;
    assert.deepEqual(await readComputerActivity(owner, null, next.id), { state: "expired", sessionId: next.id, monitor: true, causaId: cause.id });
    await assert.rejects(readComputerSession(owner, next.id), hasStatus(410)); await assert.rejects(sendComputerMessage(owner, next.id, { ...message, requestId: `expired-${tag}` }), hasStatus(410)); assert.equal(network, beforeExpired);
    // LinkedIn pending results are fictitious encrypted grants: no OAuth network is called.
    const actor = { id: owner.id, sessionVersion: owner.sessionVersion, sessionHash: digest(`session-${tag}`) }, state = randomToken(), attemptId = randomUUID();
    await prisma.personalOAuthAttempt.create({ data: { id: attemptId, ownerId: owner.id, provider: "linkedin", stateHash: digest(state), sessionHash: actor.sessionHash, sessionVersion: actor.sessionVersion, nonceHash: digest("fixture-nonce"), requestedScopesJson: '["openid","profile"]', redirectUri: process.env.LINKEDIN_REDIRECT_URI!, clientId: process.env.LINKEDIN_CLIENT_ID!, expiresAt: new Date(Date.now() + 60000) } });
    const beforeOAuth = network; await assert.rejects(receiveLinkedInCallback({ state, denied: true })); await assert.rejects(receiveLinkedInCallback({ state, denied: true }), hasStatus(409)); assert.equal(network, beforeOAuth);
    const grant = { accessToken: "fictitious-linkedin-access-token", expiresAt: new Date(Date.now() + 60000).toISOString(), scopes: ["openid", "profile"], subject: `fixture_${tag.replaceAll("-", "")}`, name: "Fictitious LinkedIn professional", email: null, pictureUrl: null };
    await prisma.personalOAuthAttempt.update({ where: { id: attemptId }, data: { phase: "ready", resultEnc: seal(grant, attemptContext(owner.id, attemptId)) } });
    await assert.rejects(completeLinkedInOAuth({ ...actor, id: outsider.id }, attemptId), hasStatus(404));
    await assert.rejects(completeLinkedInOAuth({ ...actor, sessionHash: "wrong-session" }, attemptId), hasStatus(404));
    const linked = await completeLinkedInOAuth(actor, attemptId); assert.equal(linked.connected, true); assert.equal(linked.canPublish, false); assert.equal(JSON.stringify(linked).includes(grant.accessToken), false);
    await completeLinkedInOAuth(actor, attemptId); assert.equal(await prisma.personalConnectorAccount.count({ where: { ownerId: owner.id, provider: "linkedin" } }), 1);
    assert.equal((await prisma.personalOAuthAttempt.findUniqueOrThrow({ where: { id: attemptId } })).resultEnc, null);
    const account = await prisma.personalConnectorAccount.findUniqueOrThrow({ where: { ownerId_provider: { ownerId: owner.id, provider: "linkedin" } } });
    assert.equal(publicLinkedInAccount({ ...account, expiresAt: new Date(0) }).state, "expired");
    assert.equal(network, beforeOAuth);
    console.log("Computer/LinkedIn disposable integration PASS: owner + case ACL, endpoint reservation, async acceptance before inference, first-inference control/cancel, replay, selected inputs, no typed-text persistence, unknown without resend, TTL, OAuth state single-use + session binding + no inferred publish permission. All gateway responses fictitious; no external traffic.");
  } finally {
    globalThis.fetch = fetchBefore;
    await prisma.altazorComputerAction.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorComputerSession.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorComputerWorkspace.deleteMany({ where: { id: { in: workspaces } } });
    await prisma.personalOAuthAttempt.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.personalConnectorAccount.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.causa.deleteMany({ where: { id: { in: causes } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } }); await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Fixture integration failed"); process.exitCode = 1; });
