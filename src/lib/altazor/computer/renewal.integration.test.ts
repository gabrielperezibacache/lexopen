/** Owned disposable PG and a synthetic gateway; no real account or saved browser profile. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { createSecret } from "@/lib/altazor/secrets/service";
import { configureComputer, computerStatus, controlComputer, prepareComputerSecret, renewComputerSession, typeComputerSecret } from "./service";
import { COMPUTER_LIMITS } from "./policy";

const denied = (expected: number) => (error: unknown) => Number((error as { status?: number }).status) === expected;
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  process.env.ALTAZOR_COMPUTER_ENABLED = "1";
  const stamp = randomUUID(), users: string[] = [], cases: string[] = [], workspaces: string[] = [], originalFetch = globalThis.fetch;
  const previousPolicy = await prisma.firmSettings.findFirst({ select: { id: true, assistantLlmMode: true } });
  let policyId: string | undefined, organizationId: string | undefined, mutationCount = 0, typed = 0, failGateway = false, pauseHealth: (() => Promise<void>) | undefined;
  let kitty: Record<string, unknown>;
  const chat = { id: "renewal-chat", members: ["renewal-kitty"], turns: [] };
  globalThis.fetch = (async (raw, init) => {
    const url = new URL(String(raw)); assert.equal(url.origin, "http://127.0.0.1:18849");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fictitious-renewal-token");
    if ((init?.method || "GET") !== "GET") mutationCount++;
    if (failGateway) throw new Error("Fictitious unavailable gateway");
    if (url.pathname === "/v1/health") { const pause = pauseHealth; pauseHealth = undefined; if (pause) await pause(); return Response.json({ ok: true, containers: true, version: "fictitious-renewal" }); }
    if (url.pathname === "/v1/providers") return Response.json({ providers: [{ name: "renewal-model", kind: "openai" }] });
    if (url.pathname === "/v1/kitties") return Response.json({ kitties: kitty ? [kitty] : [] });
    if (url.pathname === "/v1/kitties/renewal-kitty") return Response.json({ kitty });
    if (url.pathname === "/v1/chats/renewal-chat") return Response.json({ chat });
    if (url.pathname.endsWith("/control")) return Response.json({ held: JSON.parse(String(init?.body)).hold === true });
    if (url.pathname.endsWith("/input")) { if (JSON.parse(String(init?.body)).action === "type") typed++; return Response.json({ ok: true }); }
    throw new Error("Unexpected synthetic renewal endpoint");
  }) as typeof fetch;
  try {
    if (previousPolicy) { policyId = previousPolicy.id; await prisma.firmSettings.update({ where: { id: policyId }, data: { assistantLlmMode: "remote_allowed" } }); }
    else { const org = await prisma.organization.create({ data: { name: "Renewal fixture only", settings: { create: { assistantLlmMode: "remote_allowed" } } }, include: { settings: true } }); organizationId = org.id; policyId = org.settings!.id; }
    const owner = await prisma.user.create({ data: { email: `${stamp}@renewal.invalid`, name: "Renewal fixture owner", password: "not-a-login", role: "abogado" } }); users.push(owner.id);
    const other = await prisma.user.create({ data: { email: `${stamp}-other@renewal.invalid`, name: "Renewal fixture outsider", password: "not-a-login", role: "abogado" } }); users.push(other.id);
    const causa = await prisma.causa.create({ data: { titulo: "Renewal fixture case", tribunal: "Fictitious", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); cases.push(causa.id);
    const configured = await configureComputer(owner, { causaId: causa.id, endpoint: "http://127.0.0.1:18849", token: "fictitious-renewal-token", provider: "renewal-model", dedicated: true });
    assert.ok(configured.workspaceId); workspaces.push(configured.workspaceId);
    const session = await prisma.altazorComputerSession.create({ data: { ownerId: owner.id, workspaceId: configured.workspaceId, requestId: `session-${stamp}`, kittyId: "renewal-kitty", kittyName: `renewal-${stamp}`, chatId: chat.id, state: "ready", expiresAt: new Date(Date.now() + 60_000) } });
    kitty = { id: session.kittyId, name: session.kittyName, provider: "renewal-model", desktop: true, container: "renewal-container", connectors: ["-"], approvals: "ask", backup: "", status: "running" };
    const request = (suffix: string) => ({ requestId: `renew-${stamp}-${suffix}`, causaId: causa.id, confirmed: true as const });
    await assert.rejects(renewComputerSession(owner, session.id, { ...request("unconfirmed"), confirmed: false as unknown as true }), denied(400));
    await assert.rejects(renewComputerSession(other, session.id, request("foreign")), denied(404));
    await assert.rejects(renewComputerSession(owner, session.id, { ...request("scope"), causaId: null }), denied(404));
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "assistant.use" } });
    await assert.rejects(renewComputerSession(owner, session.id, request("revoked-actor")), denied(403));
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });
    await prisma.causa.update({ where: { id: causa.id }, data: { abogadoId: other.id } });
    await assert.rejects(renewComputerSession(owner, session.id, request("revoked-case")), denied(404));
    await prisma.causa.update({ where: { id: causa.id }, data: { abogadoId: owner.id } });
    await prisma.firmSettings.update({ where: { id: policyId }, data: { assistantLlmMode: "local_only" } });
    await assert.rejects(renewComputerSession(owner, session.id, request("policy")), denied(403));
    await prisma.firmSettings.update({ where: { id: policyId }, data: { assistantLlmMode: "remote_allowed" } });
    for (const state of ["closed", "unknown", "creating"]) {
      await prisma.altazorComputerSession.update({ where: { id: session.id }, data: { state } });
      await assert.rejects(renewComputerSession(owner, session.id, request(state)), denied(409));
    }
    await prisma.altazorComputerSession.update({ where: { id: session.id }, data: { state: "ready" } });
    failGateway = true;
    await assert.rejects(renewComputerSession(owner, session.id, request("gateway")));
    failGateway = false;
    kitty.status = "stopped";
    await assert.rejects(renewComputerSession(owner, session.id, request("stopped")), denied(409));
    kitty.status = "running";
    await controlComputer(owner, session.id, `hold-${stamp}`, true);
    const saved = await createSecret(owner, { requestId: `secret-${stamp}`, name: "Fictitious renewal secret", provider: "Fixture", kind: "password", value: "not-an-account-password" });
    const target = { sessionId: session.id, origin: "https://fixture.invalid", field: "password" as const, fieldLabel: "Declared fixture field" };
    const grant = await prepareComputerSecret(owner, session.id, { requestId: `grant-${stamp}`, secretId: saved.secret.id, revision: saved.secret.revision, target, confirmed: true });
    const beforeRenew = await prisma.altazorComputerSession.findUniqueOrThrow({ where: { id: session.id } }), beforeMutations = mutationCount, beforeTime = Date.now();
    const renewed = await renewComputerSession(owner, session.id, request("first"));
    assert.equal(renewed.status, "completed");
    const afterRenew = await prisma.altazorComputerSession.findUniqueOrThrow({ where: { id: session.id } });
    assert.equal(afterRenew.kittyId, beforeRenew.kittyId); assert.equal(afterRenew.chatId, beforeRenew.chatId); assert.equal(afterRenew.kittyName, beforeRenew.kittyName);
    assert.ok(afterRenew.updatedAt > beforeRenew.updatedAt); assert.ok(afterRenew.expiresAt.getTime() >= beforeTime + COMPUTER_LIMITS.sessionMs);
    assert.ok(afterRenew.expiresAt.getTime() <= Date.now() + COMPUTER_LIMITS.sessionMs); assert.equal(mutationCount, beforeMutations);
    await assert.rejects(typeComputerSecret(owner, session.id, { grantId: grant.id, target, confirmed: true }), denied(409)); assert.equal(typed, 0);
    assert.deepEqual(await renewComputerSession(owner, session.id, request("first")), renewed);
    assert.equal((await prisma.altazorComputerSession.findUniqueOrThrow({ where: { id: session.id } })).expiresAt.getTime(), afterRenew.expiresAt.getTime());
    const concurrent = await Promise.all([renewComputerSession(owner, session.id, request("concurrent")), renewComputerSession(owner, session.id, request("concurrent"))]);
    assert.deepEqual(concurrent[0], concurrent[1]);
    let release!: () => void, reached!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; }), barrier = new Promise<void>(resolve => { reached = resolve; });
    pauseHealth = async () => { reached(); await waiting; };
    const staleRenewal = renewComputerSession(owner, session.id, request("stale"));
    await barrier;
    await controlComputer(owner, session.id, `resume-${stamp}`, false);
    const changedSession = await prisma.altazorComputerSession.findUniqueOrThrow({ where: { id: session.id } });
    release(); await assert.rejects(staleRenewal, denied(409));
    const afterStale = await prisma.altazorComputerSession.findUniqueOrThrow({ where: { id: session.id } });
    assert.equal(afterStale.updatedAt.getTime(), changedSession.updatedAt.getTime()); assert.equal(afterStale.expiresAt.getTime(), changedSession.expiresAt.getTime());
    await prisma.altazorComputerSession.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() - 1), state: "starting" } });
    const expired = await renewComputerSession(owner, session.id, request("expired-starting")); assert.equal(expired.status, "completed");
    const conflicting = await prisma.altazorComputerSession.create({ data: { ownerId: owner.id, workspaceId: configured.workspaceId, requestId: `other-${stamp}`, kittyName: `other-${stamp}`, state: "ready", expiresAt: new Date(Date.now() + 60_000) } });
    await assert.rejects(renewComputerSession(owner, session.id, request("parallel")), denied(409));
    await prisma.altazorComputerSession.update({ where: { id: conflicting.id }, data: { expiresAt: new Date(0) } });
    await assert.rejects(renewComputerSession(owner, session.id, request("parallel-expired-but-not-stopped")), denied(409));
    await prisma.altazorComputerSession.update({ where: { id: conflicting.id }, data: { state: "closed" } });
    const cappedCreated = new Date(Date.now() - COMPUTER_LIMITS.renewalWindowMs + 60_000);
    await prisma.altazorComputerSession.update({ where: { id: session.id }, data: { state: "ready", createdAt: cappedCreated } });
    const cap = cappedCreated.getTime() + COMPUTER_LIMITS.renewalWindowMs;
    for (const suffix of ["cap-one", "cap-two"]) { const capped = await renewComputerSession(owner, session.id, request(suffix)); assert.equal(capped.result?.expiresAt, new Date(cap).toISOString()); }
    assert.equal((await computerStatus(owner, causa.id, false, session.id)).sessions.find(row => row.id === session.id)?.canRenew, true);
    await prisma.altazorComputerSession.update({ where: { id: session.id }, data: { createdAt: new Date(Date.now() - COMPUTER_LIMITS.renewalWindowMs - 1) } });
    await assert.rejects(renewComputerSession(owner, session.id, request("late-new")), denied(410));
    await assert.rejects(renewComputerSession(owner, session.id, request("cap-two")), denied(410));
    assert.equal((await computerStatus(owner, causa.id, false, session.id)).sessions.find(row => row.id === session.id)?.canRenew, false);
    assert.equal(await prisma.altazorComputerAction.count({ where: { ownerId: owner.id, kind: "renew" } }), 5);
    console.log("Renewal PG PASS: explicit human approval, same Kitty/chat, 20min expiry, sequential/concurrent replay once, stale preflight CAS denial, expired starting recovery, 2h cap across fresh IDs, late/revoked/foreign/scope/policy/closed/unknown/gateway/parallel denial, grants invalidated; zero renewal gateway mutations. Fictitious only.");
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.altazorSecret.deleteMany({ where: { ownerId: { in: users } } }); await prisma.altazorSecretReceipt.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorComputerAction.deleteMany({ where: { ownerId: { in: users } } }); await prisma.altazorComputerSession.deleteMany({ where: { ownerId: { in: users } } }); await prisma.altazorComputerWorkspace.deleteMany({ where: { id: { in: workspaces } } });
    await prisma.causa.deleteMany({ where: { id: { in: cases } } }); await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (previousPolicy) await prisma.firmSettings.update({ where: { id: previousPolicy.id }, data: { assistantLlmMode: previousPolicy.assistantLlmMode } });
    if (organizationId) await prisma.organization.delete({ where: { id: organizationId } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : error instanceof Error ? error.message : "Synthetic renewal integration failed"); process.exitCode = 1; });
