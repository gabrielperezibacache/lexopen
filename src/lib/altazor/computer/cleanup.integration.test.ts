/** Disposable PostgreSQL and a synthetic gateway only; no real desktop, account or credentials. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import type { AltazorComputerSession } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { cancelComputerSecret, cancelComputerTask, closeComputerSession, computerScreenshot, computerStatus, configureComputer, controlComputer, createComputerSession, decideComputerApproval, disableComputer, inputComputer, readComputerSession, renewComputerSession, sendComputerMessage } from "./service";

const denied = (status: number) => (error: unknown) => Number((error as { status?: number }).status) === status;
type Kitty = { auto_off_minutes?: number; id: string; name: string; provider: string; desktop: boolean; container: string; status: string; connectors: string[]; approvals: string; backup: string };
type Chat = { id: string; members: string[]; turns: unknown[] };
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  process.env.ALTAZOR_COMPUTER_ENABLED = "1";
  const stamp = randomUUID(), users: string[] = [], causes: string[] = [], workspaces: string[] = [], originalFetch = globalThis.fetch;
  const fleets = new Map<string, Kitty[]>(), chats = new Map<string, Chat>(), posts: string[] = [];
  let calls = 0, sequence = 0, failStop = false, pauseHealth: (() => Promise<void>) | undefined;
  const previousPolicy = await prisma.firmSettings.findFirst({ select: { id: true, assistantLlmMode: true } });
  let policyId: string | undefined, organizationId: string | undefined;
  globalThis.fetch = (async (raw, init) => {
    calls++; const url = new URL(String(raw)), method = init?.method || "GET", path = url.pathname;
    assert.ok(["http://127.0.0.1:18850", "http://127.0.0.1:18851"].includes(url.origin));
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fictitious-cleanup-token");
    assert.equal(/artifacts|\/exec|settings|vault|local-token|control|input|messages/.test(path), false);
    if (method !== "GET") posts.push(path);
    const fleet = fleets.get(url.origin) || []; fleets.set(url.origin, fleet);
    if (/^\/v1\/lexopen\/chats\/[A-Za-z0-9_-]{1,100}\/computer-policy$/.test(url.pathname)) {
      assert.equal(init?.method || "GET", "GET", "Legacy fixtures never grant computer-use permissions");
      const binding = url.searchParams.get("binding"), kittyId = url.searchParams.get("kitty");
      assert.match(binding || "", /^[a-f0-9]{64}$/); assert.match(kittyId || "", /^[A-Za-z0-9_-]{1,100}$/);
      return Response.json({ applied: false, chat_id: url.pathname.split("/")[4], kitty: kittyId, binding, mode: "supervised", revision: 0, allow_input: false, allow_browser: false, allow_apps: false, max_actions: 100, max_consultations: 20, actions_used: 0, consultations_used: 0, outcome_unknown: false });
    }
    if (path === "/v1/health") { const pause = pauseHealth; pauseHealth = undefined; if (pause) await pause(); return Response.json({ ok: true, containers: true, lexopen_computer_use_policy: "v1", version: "fictitious-cleanup", lexopen_async_messages: "v1" }); }
    if (path === "/v1/providers") return Response.json({ providers: [{ name: "cleanup-model", kind: "openai" }] });
    if (path === "/v1/kitties" && method === "GET") return Response.json({ kitties: fleet });
    if (/^\/v1\/kitties\/[\w-]+$/.test(path) && method === "GET") return Response.json({ kitty: fleet.find(kitty => kitty.id === path.split("/").pop() || kitty.name === path.split("/").pop()) });
    if (/^\/v1\/chats\/[\w-]+$/.test(path) && method === "GET") return Response.json({ chat: chats.get(path.split("/").pop()!) });
    if (path.endsWith("/cancel") && method === "POST") return Response.json({ cancelled: true });
    if (path.endsWith("/stop") && method === "POST") {
      const kitty = fleet.find(row => row.id === path.split("/")[3]); assert.ok(kitty); kitty.status = "stopped";
      if (failStop) { failStop = false; throw new Error("Fictitious stop response lost after acceptance"); }
      return Response.json({ kitty });
    }
    throw new Error("Unexpected synthetic cleanup endpoint");
  }) as typeof fetch;
  try {
    if (previousPolicy) { policyId = previousPolicy.id; await prisma.firmSettings.update({ where: { id: policyId }, data: { assistantLlmMode: "remote_allowed" } }); }
    else { const organization = await prisma.organization.create({ data: { name: "Cleanup fixture only", settings: { create: { assistantLlmMode: "remote_allowed" } } }, include: { settings: true } }); organizationId = organization.id; policyId = organization.settings!.id; }
    const owner = await prisma.user.create({ data: { email: `${stamp}@cleanup.invalid`, name: "Cleanup fixture owner", password: "not-a-login", role: "abogado" } }); users.push(owner.id);
    const other = await prisma.user.create({ data: { email: `${stamp}-other@cleanup.invalid`, name: "Cleanup fixture outsider", password: "not-a-login", role: "abogado" } }); users.push(other.id);
    const causa = await prisma.causa.create({ data: { titulo: "Cleanup fixture case", tribunal: "Fictitious", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); causes.push(causa.id);
    const configured = await configureComputer(owner, { causaId: causa.id, endpoint: "http://127.0.0.1:18850", token: "fictitious-cleanup-token", provider: "cleanup-model", dedicated: true });
    const personal = await configureComputer(owner, { endpoint: "http://127.0.0.1:18851", token: "fictitious-cleanup-token", provider: "cleanup-model", dedicated: true });
    assert.ok(configured.workspaceId); assert.ok(personal.workspaceId); workspaces.push(configured.workspaceId, personal.workspaceId);
    const makeSession = async (label: string, extra: Partial<Pick<AltazorComputerSession, "state" | "kittyId" | "chatId" | "createdAt" | "expiresAt">> = {}) => {
      sequence++; const id = `cleanup-kitty-${sequence}`, chatId = `cleanup-chat-${sequence}`;
      const row = await prisma.altazorComputerSession.create({ data: { ownerId: owner.id, workspaceId: configured.workspaceId!, requestId: `${stamp}-${label}`, kittyName: `cleanup-${label}-${stamp}`, kittyId: id, chatId, state: "ready", held: true, expiresAt: new Date(Date.now() - 1), ...extra } });
      fleets.get("http://127.0.0.1:18850")!.push({ auto_off_minutes: 0, id, name: row.kittyName, provider: "cleanup-model", desktop: true, container: `cleanup-container-${sequence}`, status: "running", connectors: ["-"], approvals: "ask", backup: "" });
      chats.set(chatId, { id: chatId, members: [id], turns: [] }); return row;
    };
    const request = (label: string) => `${stamp}-${label}`;
    const session = await makeSession("expired");
    assert.equal((await computerStatus(owner, causa.id)).sessions.find(row => row.id === session.id)?.requiresStop, true, "Expiry cannot attest that the remote Kitty stopped");
    await assert.rejects(createComputerSession(owner, configured.workspaceId!, `${stamp}-expired-new-session`), denied(409));
    await assert.rejects(disableComputer(owner, configured.workspaceId!), denied(409));
    await assert.rejects(configureComputer(owner, { causaId: causa.id, endpoint: "http://127.0.0.1:18850", token: "fictitious-cleanup-token", provider: "cleanup-model", dedicated: true }), denied(409));
    const forbiddenBefore = calls;
    await assert.rejects(readComputerSession(owner, session.id), denied(410));
    await assert.rejects(computerScreenshot(owner, session.id), denied(410));
    await assert.rejects(controlComputer(owner, session.id, request("hold"), true), denied(410));
    await assert.rejects(controlComputer(owner, session.id, request("release"), false), denied(410));
    await assert.rejects(inputComputer(owner, session.id, request("type"), { action: "type", args: { text: "Fictitious text" } }), denied(410));
    await assert.rejects(sendComputerMessage(owner, session.id, { requestId: request("message"), text: "Fictitious task", files: [], confirmed: true }), denied(410));
    await assert.rejects(decideComputerApproval(owner, session.id, request("approve"), "fixture-approval", true), denied(410));
    await assert.rejects(decideComputerApproval(owner, session.id, request("reject"), "fixture-approval", false), denied(410));
    await assert.rejects(cancelComputerSecret(owner, session.id, "fixture-grant"), denied(410));
    assert.equal(calls, forbiddenBefore);
    await assert.rejects(closeComputerSession(other, session.id, request("foreign")), denied(404));
    await assert.rejects(cancelComputerTask(other, session.id, request("foreign-cancel")), denied(404));
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "assistant.use" } });
    await assert.rejects(closeComputerSession(owner, session.id, request("actor-revoked")), denied(403));
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });
    await prisma.causa.update({ where: { id: causa.id }, data: { abogadoId: other.id } });
    await assert.rejects(cancelComputerTask(owner, session.id, request("case-revoked")), denied(404));
    await prisma.causa.update({ where: { id: causa.id }, data: { abogadoId: owner.id } });
    assert.equal(calls, forbiddenBefore);
    await prisma.firmSettings.update({ where: { id: policyId }, data: { assistantLlmMode: "local_only" } });
    const cancelled = await cancelComputerTask(owner, session.id, request("cancel")); assert.equal(cancelled.status, "completed"); assert.equal(cancelled.result?.cancelled, true);
    const afterCancel = calls; assert.deepEqual(await cancelComputerTask(owner, session.id, request("cancel")), cancelled); assert.equal(calls, afterCancel);
    assert.equal((await prisma.altazorComputerSession.findUniqueOrThrow({ where: { id: session.id } })).expiresAt!.getTime(), session.expiresAt!.getTime());
    const closed = await closeComputerSession(owner, session.id, request("close")); assert.equal(closed.status, "completed"); assert.equal(closed.result?.stopped, true);
    const stopped = await prisma.altazorComputerSession.findUniqueOrThrow({ where: { id: session.id } });
    assert.equal(stopped.state, "closed"); assert.equal(stopped.held, false); assert.equal(stopped.expiresAt!.getTime(), session.expiresAt!.getTime());
    assert.equal((await computerStatus(owner, causa.id, false, session.id)).sessions.find(row => row.id === session.id)?.state, "closed");
    const afterClose = calls; assert.deepEqual(await closeComputerSession(owner, session.id, request("close")), closed); assert.equal(calls, afterClose);
    await assert.rejects(closeComputerSession(owner, session.id, request("closed-again")), denied(409));
    await assert.rejects(cancelComputerTask(owner, session.id, request("closed-cancel")), denied(409)); assert.equal(calls, afterClose);
    await assert.rejects(cancelComputerTask(owner, session.id, request("close")), denied(409)); assert.equal(calls, afterClose);
    await prisma.firmSettings.update({ where: { id: policyId }, data: { assistantLlmMode: "remote_allowed" } });
    const late = await makeSession("late", { createdAt: new Date(Date.now() - (2 * 60 * 60_000) - 60_000) });
    assert.equal((await renewComputerSession(owner, late.id, { requestId: request("late-renew"), causaId: causa.id, confirmed: true })).status, "completed");
    assert.equal((await closeComputerSession(owner, late.id, request("late-close"))).status, "completed");
    const partial = await makeSession("partial", { state: "unknown", kittyId: null, chatId: null });
    const partialBefore = posts.length; assert.equal((await closeComputerSession(owner, partial.id, request("partial-close"))).status, "completed");
    const recovered = await prisma.altazorComputerSession.findUniqueOrThrow({ where: { id: partial.id } }); assert.ok(recovered.kittyId); assert.equal(recovered.state, "closed");
    assert.equal(posts.length - partialBefore, 1); assert.ok(posts.at(-1)?.endsWith("/stop"));
    const wrongChat = await makeSession("wrong-chat"); chats.get(wrongChat.chatId!)!.members = ["foreign-kitty"];
    const pinBefore = posts.length; await assert.rejects(closeComputerSession(owner, wrongChat.id, request("wrong-chat")), denied(502)); assert.equal(posts.length, pinBefore);
    chats.get(wrongChat.chatId!)!.members = [wrongChat.kittyId!];
    const wrongKitty = await makeSession("wrong-kitty"), kitty = fleets.get("http://127.0.0.1:18850")!.find(row => row.id === wrongKitty.kittyId)!;
    kitty.provider = "foreign-provider"; await assert.rejects(closeComputerSession(owner, wrongKitty.id, request("wrong-kitty")), denied(502)); assert.equal(posts.length, pinBefore); kitty.provider = "cleanup-model";
    const race = async (label: string, mutate: (row: AltazorComputerSession) => Promise<unknown>, extra: Parameters<typeof makeSession>[1] = {}) => {
      const row = await makeSession(label, extra); let reached!: () => void, release!: () => void;
      const waiting = new Promise<void>(resolve => { release = resolve; }), barrier = new Promise<void>(resolve => { reached = resolve; });
      pauseHealth = async () => { reached(); await waiting; }; const before = posts.length;
      const attempt = closeComputerSession(owner, row.id, request(label)); await barrier; await mutate(row); release();
      await assert.rejects(attempt, denied(409)); assert.equal(posts.length, before); return row;
    };
    await race("expiry-race", row => prisma.altazorComputerSession.update({ where: { id: row.id }, data: { expiresAt: new Date(row.expiresAt!.getTime() - 1), updatedAt: row.updatedAt } }));
    const recoveryRace = await race("recovery-race", row => prisma.altazorComputerSession.update({ where: { id: row.id }, data: { state: "closed" } }), { state: "unknown", kittyId: null, chatId: null });
    assert.equal((await prisma.altazorComputerSession.findUniqueOrThrow({ where: { id: recoveryRace.id } })).kittyId, null);
    const scopeRace = await race("workspace-race", row => prisma.altazorComputerSession.update({ where: { id: row.id }, data: { workspaceId: personal.workspaceId!, updatedAt: row.updatedAt } }));
    await prisma.altazorComputerSession.update({ where: { id: scopeRace.id }, data: { workspaceId: configured.workspaceId! } });
    const concurrent = await makeSession("concurrent"), concurrentBefore = posts.length;
    const replies = await Promise.all([closeComputerSession(owner, concurrent.id, request("concurrent")), closeComputerSession(owner, concurrent.id, request("concurrent"))]);
    assert.equal(replies[0].id, replies[1].id); assert.equal(posts.length - concurrentBefore, 2);
    const concurrentAfter = calls; assert.equal((await closeComputerSession(owner, concurrent.id, request("concurrent"))).status, "completed"); assert.equal(calls, concurrentAfter);
    const lost = await makeSession("lost"); failStop = true;
    await assert.rejects(closeComputerSession(owner, lost.id, request("lost")), denied(503)); const lostAfter = calls;
    assert.equal((await closeComputerSession(owner, lost.id, request("lost"))).status, "unknown"); assert.equal(calls, lostAfter);
    assert.notEqual((await prisma.altazorComputerSession.findUniqueOrThrow({ where: { id: lost.id } })).state, "closed");
    // A database failure after the synthetic stop must never leave a completed
    // receipt without the matching terminal state (or claim a confirmed closure).
    await prisma.$executeRawUnsafe(`CREATE FUNCTION lexopen_cleanup_reject_close() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."kittyName" LIKE 'cleanup-atomic-%' THEN RAISE EXCEPTION 'Disposable cleanup finalization failure'; END IF; RETURN NEW; END $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER lexopen_cleanup_atomic BEFORE UPDATE OF state ON "AltazorComputerSession" FOR EACH ROW WHEN (NEW.state = 'closed') EXECUTE FUNCTION lexopen_cleanup_reject_close()`);
    const atomic = await makeSession("atomic"); await assert.rejects(closeComputerSession(owner, atomic.id, request("atomic")));
    const receipt = await prisma.altazorComputerAction.findUniqueOrThrow({ where: { ownerId_requestId: { ownerId: owner.id, requestId: request("atomic") } } });
    assert.equal(receipt.status, "unknown"); assert.equal(receipt.resultJson, null); assert.notEqual((await prisma.altazorComputerSession.findUniqueOrThrow({ where: { id: atomic.id } })).state, "closed");
    const atomicAfter = calls; assert.equal((await closeComputerSession(owner, atomic.id, request("atomic"))).status, "unknown"); assert.equal(calls, atomicAfter);
    console.log("Cleanup PG PASS: explicit expired/2h cancel+stop only; owner/case/actor ACL, local_only cleanup, unchanged TTL, closed metadata, pinned chat/kitty, partial recovery CAS, exact expiry/workspace races, concurrent single receipt, lost-response replay and atomic receipt+closed rollback. No real gateway or private data.");
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.$executeRawUnsafe('DROP TRIGGER IF EXISTS lexopen_cleanup_atomic ON "AltazorComputerSession"'); await prisma.$executeRawUnsafe("DROP FUNCTION IF EXISTS lexopen_cleanup_reject_close()");
    await prisma.altazorComputerAction.deleteMany({ where: { ownerId: { in: users } } }); await prisma.altazorComputerSession.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorComputerWorkspace.deleteMany({ where: { id: { in: workspaces } } }); await prisma.causa.deleteMany({ where: { id: { in: causes } } }); await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (previousPolicy) await prisma.firmSettings.update({ where: { id: previousPolicy.id }, data: { assistantLlmMode: previousPolicy.assistantLlmMode } });
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } }); await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Synthetic cleanup integration failed"); process.exitCode = 1; });
