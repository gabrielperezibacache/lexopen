/** Real application services + disposable PostgreSQL + an in-memory HTTP gateway. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { digest, seal } from "@/lib/personal-connectors/core";
import { readComputerContent, resumeComputerHelp } from "./service";

const statusIs = (status: number) => (error: unknown) => (error as { status?: number }).status === status;
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const saved = { SESSION_SECRET: process.env.SESSION_SECRET, ALTAZOR_COMPUTER_ENABLED: process.env.ALTAZOR_COMPUTER_ENABLED };
  Object.assign(process.env, { SESSION_SECRET: "computer-read-help-fictitious-session-secret-32", ALTAZOR_COMPUTER_ENABLED: "1" });
  const tag = randomUUID(), userIds: string[] = [], sessionId = randomUUID(), workspaceId = randomUUID();
  let organizationId = "", causeId = "", network = 0, reads = 0, helpPosts = 0, messagePosts = 0, loseHelp = false;
  let question = "Pregunta de ayuda vigente", readEffect: (() => Promise<void>) | undefined;
  const text = "Contenido semántico ficticio que no debe persistirse en recibos";
  const kitty = { id: "kitty-fixture", name: `fixture-${tag}`, provider: "fictitious-model", desktop: true, container: "fixture-container", status: "running", connectors: ["-"], approvals: "ask", backup: "" };
  type RawStep = { action: string; args?: { reason: string }; result?: string };
  const plan = "Plan inicial que permanece igual durante todas las ayudas";
  const chat = { id: "chat-fixture", members: [kitty.id], turns: [{ from: kitty.id, text: plan, working: true, needs_help: false, steps: [{ action: "ask_help", args: { reason: question }, result: question }] as RawStep[] }] };
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async (raw, init) => {
    network++;
    const target = new URL(String(raw)), path = target.pathname, method = init?.method || "GET";
    assert.equal(target.origin, "http://127.0.0.1:17777");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fixture-gateway-credential");
    let result: unknown;
    if (path === "/v1/health") result = { ok: true, version: "read-help-fixture", containers: true };
    else if (path === "/v1/providers") result = { providers: [{ name: kitty.provider, kind: "openai", describe: "Fixture" }] };
    else if (path === "/v1/kitties") result = { kitties: [kitty] };
    else if (path === `/v1/kitties/${kitty.id}`) result = { kitty };
    else if (path === `/v1/chats/${chat.id}`) { const step = chat.turns[0].steps.at(-1); if (step?.action === "ask_help") { step.args = { reason: question }; step.result = question; } result = { chat }; }
    else if (path === `/v1/kitties/${kitty.id}/read`) {
      assert.equal(method, "POST"); reads++;
      const input = JSON.parse(String(init?.body));
      assert.equal(input.source, "browser");
      if (readEffect) await readEffect();
      result = { version: "v1", source: "browser", title: "Fixture page", url: "https://fixture.invalid/page", text, totalChars: text.length, offset: 0, nextOffset: null, items: [{ ref: 1, role: "heading", label: "Fixture heading" }], elementOffset: 0, nextElementOffset: null, method: "dom", redacted: true };
    } else if (path === `/v1/chats/${chat.id}/turns/0/help`) {
      assert.equal(method, "POST"); helpPosts++;
      assert.deepEqual(JSON.parse(String(init?.body)), { text: "Respuesta humana validada", secret: false, enter: false, save: "" });
      chat.turns[0].working = false;
      chat.turns[0].steps.push({ action: "helped" });
      if (loseHelp) { loseHelp = false; throw Error("Fictitious connection lost after help acceptance"); }
      result = { ok: true };
    } else if (path.endsWith("/messages")) { messagePosts++; throw Error("Help must not launch another task"); }
    else throw Error(`Unexpected fixture endpoint ${path}`);
    return Response.json(result);
  }) as typeof fetch;
  try {
    const owner = await prisma.user.create({ data: { name: "Read/help owner", email: `${tag}@read-help.invalid`, role: "abogado", password: "not-a-login" } });
    const other = await prisma.user.create({ data: { name: "Read/help other", email: `${tag}-other@read-help.invalid`, role: "abogado", password: "not-a-login" } });
    userIds.push(owner.id, other.id);
    organizationId = (await prisma.organization.create({ data: { settings: { create: { assistantLlmMode: "remote_allowed", require2faPrivileged: false } } } })).id;
    const cause = await prisma.causa.create({ data: { titulo: "Read/help fixture case", acceso: "equipo", abogadoId: owner.id, materia: "civil", tribunal: "Fictitious tribunal" } }); causeId = cause.id;
    const scopeKey = `causa:${cause.id}`;
    await prisma.altazorComputerWorkspace.create({ data: { id: workspaceId, ownerId: owner.id, causaId: cause.id, scopeKey, endpoint: "http://127.0.0.1:17777", providerName: kitty.provider, enabled: true, dedicatedDeclaredAt: new Date(), credentialEnc: seal({ token: "fixture-gateway-credential" }, `altazor:computer:${owner.id}:${workspaceId}:${scopeKey}`) } });
    await prisma.altazorComputerSession.create({ data: { id: sessionId, ownerId: owner.id, workspaceId, requestId: tag, kittyName: kitty.name, kittyId: kitty.id, chatId: chat.id, state: "ready", connectorNamesJson: '["-"]', expiresAt: new Date(Date.now() + 20 * 60_000) } });
    const content = await readComputerContent(owner, sessionId, { source: "browser", limit: 1000 });
    assert.equal(content.text, text);
    assert.equal(reads, 1);
    assert.equal(await prisma.altazorComputerAction.count({ where: { ownerId: owner.id } }), 0, "semantic reading does not create operation or text receipts");
    let before = network;
    await assert.rejects(readComputerContent(other, sessionId, { source: "browser" }), statusIs(404));
    assert.equal(network, before);
    await prisma.altazorComputerSession.update({ where: { id: sessionId }, data: { held: true } });
    before = network;
    await assert.rejects(readComputerContent(owner, sessionId, { source: "browser" }), statusIs(409));
    assert.equal(network, before, "manual control blocks semantic reading before any gateway request");
    await prisma.altazorComputerSession.update({ where: { id: sessionId }, data: { held: false } });
    await prisma.firmSettings.update({ where: { organizationId }, data: { assistantLlmMode: "local_only" } });
    before = network;
    await assert.rejects(readComputerContent(owner, sessionId, { source: "browser" }), statusIs(403));
    assert.equal(network, before);
    await prisma.firmSettings.update({ where: { organizationId }, data: { assistantLlmMode: "remote_allowed" } });
    readEffect = async () => { await prisma.causa.update({ where: { id: cause.id }, data: { abogadoId: other.id } }); };
    await assert.rejects(readComputerContent(owner, sessionId, { source: "browser" }), statusIs(404));
    assert.equal(reads, 2, "a reading fetched during revocation is discarded by the post-read ACL check");
    readEffect = undefined;
    await prisma.causa.update({ where: { id: cause.id }, data: { abogadoId: owner.id } });

    const response = "Respuesta humana validada";
    async function waiting(value: string, stepIndex = 0) {
      question = value;
      chat.turns[0] = { from: kitty.id, text: plan, working: true, needs_help: false, steps: [...Array.from({ length: stepIndex }, () => ({ action: "helped" })), { action: "ask_help", args: { reason: value }, result: value }] };
      return prisma.altazorHelpRequest.create({ data: { ownerId: owner.id, requestKey: digest(`${owner.id}:computer:${sessionId}:0:${stepIndex}:${digest(value)}`), question: value, computerSessionId: sessionId, computerTurnId: "0", scopeKind: "causa", scopeId: cause.id, correlationHash: digest(randomUUID()), status: "resuming", response, responseSource: "ntfy", expiresAt: new Date(Date.now() + 10 * 60_000) } });
    }
    const help = await waiting(question), input = { requestId: help.id, turnIndex: 0, response };
    const sent = await resumeComputerHelp(owner, sessionId, input);
    assert.equal(sent.status, "completed");
    assert.equal(helpPosts, 1);
    assert.equal(messagePosts, 0, "help uses /turns/{index}/help rather than /messages");
    before = network;
    assert.equal((await resumeComputerHelp(owner, sessionId, input)).status, "completed");
    assert.equal(network, before, "a confirmed receipt replay never calls the gateway");
    await prisma.altazorHelpRequest.update({ where: { id: help.id }, data: { status: "resumed" } });
    assert.equal((await resumeComputerHelp(owner, sessionId, input)).status, "completed");
    await assert.rejects(resumeComputerHelp(other, sessionId, input), statusIs(409));
    await assert.rejects(resumeComputerHelp(owner, sessionId, { ...input, turnIndex: 1 }), statusIs(409));
    await assert.rejects(resumeComputerHelp(owner, sessionId, { ...input, response: "Unbound replacement" }), statusIs(409));
    assert.equal(network, before);
    await prisma.altazorHelpRequest.update({ where: { id: help.id }, data: { expiresAt: new Date(0) } });
    await assert.rejects(resumeComputerHelp(owner, sessionId, input), statusIs(409));
    assert.equal(network, before);

    const secondStep = await waiting(help.question, 2);
    assert.notEqual(secondStep.id, help.id);
    assert.equal(chat.turns[0].text, plan);
    assert.equal((await resumeComputerHelp(owner, sessionId, { requestId: secondStep.id, turnIndex: 0, response })).status, "completed");
    assert.equal(helpPosts, 2, "a second ask_help in the same turn and unchanged plan has its own authenticated response");

    const stale = await waiting("Pregunta que cambió"), staleInput = { requestId: stale.id, turnIndex: 0, response };
    question = "Pregunta nueva con el mismo índice";
    await assert.rejects(resumeComputerHelp(owner, sessionId, staleInput), statusIs(409));
    assert.equal(helpPosts, 2, "a question fingerprint mismatch cannot post a reply");
    const staleReceipt = await prisma.altazorComputerAction.findUniqueOrThrow({ where: { ownerId_requestId: { ownerId: owner.id, requestId: `help:${stale.id}` } } });
    assert.equal(staleReceipt.status, "unknown");
    before = network;
    assert.equal((await resumeComputerHelp(owner, sessionId, staleInput)).status, "unknown");
    assert.equal(network, before);

    const heldHelp = await waiting("Pregunta durante control manual"), heldInput = { requestId: heldHelp.id, turnIndex: 0, response };
    await prisma.altazorComputerSession.update({ where: { id: sessionId }, data: { held: true } });
    await assert.rejects(resumeComputerHelp(owner, sessionId, heldInput), statusIs(409));
    assert.equal(helpPosts, 2);
    await prisma.altazorComputerSession.update({ where: { id: sessionId }, data: { held: false } });
    const lost = await waiting("Pregunta con confirmación perdida"), lostInput = { requestId: lost.id, turnIndex: 0, response };
    loseHelp = true;
    await assert.rejects(resumeComputerHelp(owner, sessionId, lostInput));
    assert.equal(helpPosts, 3);
    before = network;
    assert.equal((await resumeComputerHelp(owner, sessionId, lostInput)).status, "unknown");
    assert.equal(network, before, "an accepted but unconfirmed reply is never sent again");
    assert.equal(helpPosts, 3);
    assert.equal(messagePosts, 0);
    const terminal = await waiting("Ayuda terminal sin canal activo", 4);
    chat.turns[0].working = false;
    chat.turns[0].needs_help = true;
    await assert.rejects(resumeComputerHelp(owner, sessionId, { requestId: terminal.id, turnIndex: 0, response }), statusIs(409));
    assert.equal(helpPosts, 3, "terminal needs_help does not imply an upstream help channel still exists");
    assert.equal(JSON.stringify(await prisma.altazorComputerAction.findMany({ where: { ownerId: owner.id } })).includes(response), false, "receipts retain response hashes, never the typed reply");
    console.log("Computer semantic read/help integration passed: owner/manual/local-only/post-read ACL; bound current help endpoint, one-use receipts, wrong owner/question/turn/response/expiry denied and unknown never retried. Synthetic gateway only.");
  } finally {
    globalThis.fetch = oldFetch;
    await prisma.altazorComputerAction.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.altazorHelpRequest.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.altazorComputerSession.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.altazorComputerWorkspace.deleteMany({ where: { ownerId: { in: userIds } } });
    if (causeId) await prisma.causa.delete({ where: { id: causeId } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
    for (const [key, value] of Object.entries(saved)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; }
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
