/** Owned disposable PG and an in-memory gateway; no personal accounts or documents. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { altazorCauseOptions } from "@/lib/altazor/resources";
import { createSecret } from "@/lib/altazor/secrets/service";
import { computerStatus, configureComputer, controlComputer, inputComputer, prepareComputerSecret, typeComputerSecret } from "./service";

const status = (expected: number) => (error: unknown) => (error as { status?: number }).status === expected;
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  process.env.ALTAZOR_COMPUTER_ENABLED = "1";
  const stamp = randomUUID(), users: string[] = [], cases: string[] = [], workspaces: string[] = [], originalFetch = globalThis.fetch;
  let pauseHealth: (() => Promise<void>) | undefined, typed = 0;
  let kitty: Record<string, unknown>;
  const chat = { id: "navigation-chat", members: ["navigation-kitty"], turns: [] };
  globalThis.fetch = (async (raw, init) => {
    const url = new URL(String(raw)); assert.equal(url.origin, "http://127.0.0.1:18846");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer fictitious-navigation-token");
    let result: unknown;
    if (url.pathname === "/v1/health") { const pause = pauseHealth; pauseHealth = undefined; if (pause) await pause(); result = { ok: true, containers: true, version: "fictitious-navigation-contract" }; }
    else if (url.pathname === "/v1/providers") result = { providers: [{ name: "navigation-model", kind: "openai" }] };
    else if (url.pathname === "/v1/kitties") result = { kitties: kitty ? [kitty] : [] };
    else if (url.pathname === "/v1/kitties/navigation-kitty") result = { kitty };
    else if (url.pathname === "/v1/chats/navigation-chat") result = { chat };
    else if (url.pathname.endsWith("/control")) result = { held: JSON.parse(String(init?.body)).hold === true };
    else if (url.pathname.endsWith("/input")) { if (JSON.parse(String(init?.body)).action === "type") typed++; result = { ok: true }; }
    else throw new Error("Unexpected fixture endpoint");
    return Response.json(result);
  }) as typeof fetch;
  try {
    const owner = await prisma.user.create({ data: { name: "Navigation fixture owner", email: `${stamp}@navigation.invalid`, password: "not-a-login", role: "abogado" } }); users.push(owner.id);
    const other = await prisma.user.create({ data: { name: "Navigation fixture outsider", email: `${stamp}-other@navigation.invalid`, password: "not-a-login", role: "abogado" } }); users.push(other.id);
    const old = await prisma.causa.create({ data: { titulo: "Older accessible fixture case", tribunal: "Fictitious tribunal", materia: "civil", acceso: "equipo", abogadoId: owner.id, updatedAt: new Date(1) } }); cases.push(old.id);
    for (let i = 0; i < 101; i++) { const row = await prisma.causa.create({ data: { titulo: `Recent fixture ${i}`, tribunal: "Fictitious tribunal", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); cases.push(row.id); }
    const foreign = await prisma.causa.create({ data: { titulo: "Foreign fixture case", tribunal: "Fictitious tribunal", materia: "civil", acceso: "equipo", abogadoId: other.id } }); cases.push(foreign.id);
    assert.equal((await altazorCauseOptions(owner)).some(row => row.id === old.id), false);
    const pinned = await altazorCauseOptions(owner, old.id);
    assert.equal(pinned.length, 101); assert.equal(pinned.filter(row => row.id === old.id).length, 1);
    await assert.rejects(altazorCauseOptions(owner, foreign.id), status(404));

    const configured = await configureComputer(owner, { causaId: old.id, endpoint: "http://127.0.0.1:18846", token: "fictitious-navigation-token", provider: "navigation-model", dedicated: true });
    assert.ok(configured.workspaceId); workspaces.push(configured.workspaceId);
    const session = await prisma.altazorComputerSession.create({ data: { ownerId: owner.id, workspaceId: configured.workspaceId, requestId: `old-${stamp}`, kittyId: "navigation-kitty", kittyName: `navigation-${stamp}`, chatId: chat.id, state: "closed", createdAt: new Date(1), expiresAt: new Date(Date.now() + 300_000) } });
    kitty = { id: session.kittyId, name: session.kittyName, provider: "navigation-model", desktop: true, container: "navigation-container", connectors: ["-"], approvals: "ask", backup: "", status: "stopped" };
    for (let i = 0; i < 16; i++) await prisma.altazorComputerSession.create({ data: { ownerId: owner.id, workspaceId: configured.workspaceId, requestId: `recent-${stamp}-${i}`, kittyName: `recent-${stamp}-${i}`, state: "closed", expiresAt: new Date(0) } });
    assert.equal((await computerStatus(owner, old.id)).sessions.some(row => row.id === session.id), false);
    assert.equal((await computerStatus(owner, old.id, false, session.id)).sessions.filter(row => row.id === session.id).length, 1);
    await assert.rejects(computerStatus(other, null, false, session.id), status(404));
    await assert.rejects(computerStatus(owner, null, false, session.id), status(404));
    await prisma.altazorComputerSession.update({ where: { id: session.id }, data: { state: "ready", expiresAt: new Date(0) } });
    kitty.status = "running";
    const pendingList = (await computerStatus(owner, old.id)).sessions;
    assert.equal(pendingList[0]?.id, session.id, "A pending stop remains discoverable beyond the 15 most recent sessions");
    assert.equal(pendingList[0]?.requiresStop, true); assert.equal(pendingList.length, 15);
    assert.equal((await computerStatus(owner, old.id, false, session.id)).sessions.find(row => row.id === session.id)?.state, "expired");
    await prisma.altazorComputerSession.update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + 300_000) } });

    await controlComputer(owner, session.id, `hold-${stamp}`, true);
    const saved = await createSecret(owner, { requestId: `secret-${stamp}`, name: "Fictitious secret", provider: "Fixture", kind: "password", value: "not-an-account-password" });
    const target = { sessionId: session.id, origin: "https://fixture.invalid", field: "password" as const, fieldLabel: "Declared fixture field" };
    const grant = await prepareComputerSecret(owner, session.id, { requestId: `grant-${stamp}`, secretId: saved.secret.id, revision: saved.secret.revision, target, confirmed: true });
    let release!: () => void, reached!: () => void;
    const waiting = new Promise<void>(resolve => { release = resolve; }), barrier = new Promise<void>(resolve => { reached = resolve; });
    pauseHealth = async () => { reached(); await waiting; };
    const stale = controlComputer(owner, session.id, `stale-hold-${stamp}`, true);
    await barrier;
    await inputComputer(owner, session.id, `new-focus-${stamp}`, { action: "click", args: { x: 10, y: 20 } });
    const changedAt = (await prisma.altazorComputerSession.findUniqueOrThrow({ where: { id: session.id } })).updatedAt.getTime();
    release();
    await assert.rejects(stale, status(409));
    assert.equal((await prisma.altazorComputerSession.findUniqueOrThrow({ where: { id: session.id } })).updatedAt.getTime(), changedAt, "A stale claim must never rewind the focus/control timestamp");
    await assert.rejects(typeComputerSecret(owner, session.id, { grantId: grant.id, target, confirmed: true }), status(409));
    assert.equal(typed, 0);
    console.log("Navigation PG PASS: explicit case beyond100, session beyond15, expired metadata, owner/scope denial, stale claim rejected and changed-focus secret grant unusable. Fictitious only.");
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.altazorSecret.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorSecretReceipt.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorComputerAction.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorComputerSession.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.altazorComputerWorkspace.deleteMany({ where: { id: { in: workspaces } } });
    await prisma.causa.deleteMany({ where: { id: { in: cases } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof assert.AssertionError ? error.message : "Synthetic navigation integration failed"); process.exitCode = 1; });
