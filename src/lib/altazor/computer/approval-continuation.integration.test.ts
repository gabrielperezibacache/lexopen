/** Own disposable PostgreSQL fixtures and a synthetic gateway; no real accounts. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { digest, seal } from "@/lib/personal-connectors/core";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { decideComputerApproval, sendComputerMessage } from "./service";

type Fixture = { id: string; kittyId: string; kittyName: string; chatId: string; approvalId: string; approved: boolean; rejected: boolean; failed: boolean; lost: boolean; working: boolean };
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  process.env.ALTAZOR_COMPUTER_ENABLED = "1";
  const stamp = randomUUID(), userIds: string[] = [], workspaceIds: string[] = [], caseIds: string[] = [];
  const oldFetch = globalThis.fetch, sessions: Fixture[] = [], payloads: Record<string, unknown>[] = [];
  let connector = "", approved = 0, rejected = 0, requests = 0, workspaceId = "";
  globalThis.fetch = (async (raw, init) => {
    requests++;
    const url = new URL(String(raw)), path = url.pathname, method = init?.method || "GET";
    assert.equal(url.origin, "http://127.0.0.1:18887");
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fictitious-continuation-token");
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    const kitty = (fixture: Fixture) => ({ id: fixture.kittyId, name: fixture.kittyName, provider: "fictitious-continuation-model", desktop: true, container: `kitty-${fixture.kittyName}`, status: "running", connectors: [connector], approvals: "ask", backup: "" });
    if (path === "/v1/health") return Response.json({ ok: true, containers: true, version: "fictitious-continuation-contract", lexopen_connector_gate: "v1", lexopen_file_reads: "v1", lexopen_async_messages: "v1" });
    if (path === "/v1/providers") return Response.json({ providers: [{ name: "fictitious-continuation-model", kind: "openai" }] });
    if (path === "/v1/kitties") return Response.json({ kitties: sessions.map(kitty) });
    if (path.startsWith("/v1/kitties/")) {
      const fixture = sessions.find(item => item.kittyId === path.split("/").pop()); assert.ok(fixture);
      return Response.json({ kitty: kitty(fixture) });
    }
    if (path === "/v1/approvals") return Response.json({ approvals: sessions.filter(item => !item.approved && !item.rejected).map(item => ({
      id: item.approvalId, kitty: item.kittyId, chat: item.chatId, connector, kind: "github", action: "download_file", status: "pending", at: "2030-05-06T17:00:00Z", summary: "Read a fictitious public README", args: { action: "download_file", repo: "fictitious/fixture", path: "README.md" },
    })) });
    if (path.startsWith("/v1/approvals/")) {
      assert.equal(method, "POST"); assert.equal(body.always, false);
      const fixture = sessions.find(item => item.approvalId === path.split("/")[3]); assert.ok(fixture);
      assert.equal(fixture.approved || fixture.rejected, false, "a native decision must never be replayed");
      const approve = path.endsWith("/approve");
      if (approve) { approved++; fixture.approved = true; } else { rejected++; fixture.rejected = true; }
      return Response.json({ approval: { id: fixture.approvalId, kitty: fixture.kittyId, chat: fixture.chatId, status: approve ? "approved" : "rejected", always: false, ...(fixture.failed ? { error: "Fictitious file read failed" } : {}) } });
    }
    if (path.endsWith("/messages/async")) {
      assert.equal(method, "POST");
      const fixture = sessions.find(item => item.chatId === path.split("/")[3]); assert.ok(fixture);
      payloads.push(body);
      assert.equal(body.text, "continua"); assert.deepEqual(body.files, []);
      assert.match(String(body.request_id), /^approval_[A-Za-z0-9_-]{1,90}$/);
      if (fixture.lost) throw new Error("Fictitious acknowledgement lost after gateway acceptance");
      fixture.working = true;
      return Response.json({ request_id: body.request_id, chat_id: fixture.chatId, status: "accepted", state: "accepted" }, { status: 202 });
    }
    if (path.startsWith("/v1/chats/")) {
      const fixture = sessions.find(item => item.chatId === path.split("/").pop()); assert.ok(fixture);
      return Response.json({ chat: { id: fixture.chatId, members: [fixture.kittyId], turns: [{ from: fixture.kittyId, text: "Fictitious pending read", working: fixture.working, steps: [] }] } });
    }
    throw new Error("Unexpected synthetic continuation endpoint");
  }) as typeof fetch;
  try {
    const owner = await prisma.user.create({ data: { name: "Continuation fixture owner", email: `${stamp}@continuation.invalid`, role: "abogado", password: "not-a-login" } }); userIds.push(owner.id);
    const outsider = await prisma.user.create({ data: { name: "Continuation fixture outsider", email: `${stamp}-other@continuation.invalid`, role: "abogado", password: "not-a-login" } }); userIds.push(outsider.id);
    const cause = await prisma.causa.create({ data: { titulo: "Fictitious continuation case", tribunal: "Fictitious tribunal", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); caseIds.push(cause.id);
    workspaceId = randomUUID(); const scopeKey = `causa:${cause.id}`;
    await prisma.altazorComputerWorkspace.create({ data: { id: workspaceId, ownerId: owner.id, causaId: cause.id, scopeKey, endpoint: "http://127.0.0.1:18887", providerName: "fictitious-continuation-model", enabled: true, dedicatedDeclaredAt: new Date(), credentialEnc: seal({ token: "fictitious-continuation-token" }, `altazor:computer:${owner.id}:${workspaceId}:${scopeKey}`) } }); workspaceIds.push(workspaceId);
    connector = `altazor-github-${digest(`${owner.id}:${workspaceId}`).slice(0, 16)}`;
    async function session(suffix: string, flags: Partial<Pick<Fixture, "failed" | "lost">> = {}) {
      const row = await prisma.altazorComputerSession.create({ data: { ownerId: owner.id, workspaceId, requestId: `session-${stamp}-${suffix}`, kittyId: `kitty-${suffix}`, kittyName: `altazor-${suffix}-${stamp}`, chatId: `chat-${suffix}`, state: "ready", connectorNamesJson: JSON.stringify([connector]), expiresAt: new Date(Date.now() + 300_000) } });
      const fixture: Fixture = { id: row.id, kittyId: row.kittyId!, kittyName: row.kittyName, chatId: row.chatId!, approvalId: `approval-${suffix}`, approved: false, rejected: false, failed: false, lost: false, working: false, ...flags }; sessions.push(fixture); return fixture;
    }
    const success = await session("success");
    const beforeDenied = requests;
    await assert.rejects(decideComputerApproval(outsider, success.id, `outsider-${stamp}`, success.approvalId, true), error => (error as { status?: number }).status === 404);
    assert.equal(requests, beforeDenied, "a different owner cannot reach the gateway");
    const requestId = `decision-${stamp}`;
    const result = await decideComputerApproval(owner, success.id, requestId, success.approvalId, true);
    assert.equal(result.status, "completed"); assert.equal(approved, 1); assert.equal(payloads.length, 1);
    const receipt = await prisma.altazorComputerAction.findUniqueOrThrow({ where: { ownerId_requestId: { ownerId: owner.id, requestId } } });
    assert.equal(payloads[0].request_id, `approval_${receipt.id}`, "continuation is bound to the persisted decision, never a fresh browser id");
    const beforeReplay = requests;
    await decideComputerApproval(owner, success.id, requestId, success.approvalId, true);
    assert.equal(requests, beforeReplay); assert.equal(approved, 1); assert.equal(payloads.length, 1);

    const reject = await session("reject");
    assert.equal((await decideComputerApproval(owner, reject.id, `reject-${stamp}`, reject.approvalId, false)).status, "completed");
    assert.equal(rejected, 1); assert.equal(payloads.length, 1, "rejection does not resume the model");
    const failed = await session("failed", { failed: true });
    const failedResult = await decideComputerApproval(owner, failed.id, `failed-${stamp}`, failed.approvalId, true);
    assert.equal(failedResult.status, "completed"); assert.equal(failedResult.result?.failed, true); assert.equal(payloads.length, 1, "failed reads do not resume the model");

    const lost = await session("lost", { lost: true }), lostId = `lost-${stamp}`;
    await assert.rejects(decideComputerApproval(owner, lost.id, lostId, lost.approvalId, true), error => (error as { code?: string }).code === "continuation_unknown");
    assert.equal(approved, 3); assert.equal(payloads.length, 2);
    const uncertain = await prisma.altazorComputerAction.findUniqueOrThrow({ where: { ownerId_requestId: { ownerId: owner.id, requestId: lostId } } });
    assert.equal(uncertain.status, "unknown"); assert.equal(uncertain.resultJson, null);
    assert.equal(payloads[1].request_id, `approval_${uncertain.id}`);
    const beforeLostReplay = requests;
    assert.equal((await decideComputerApproval(owner, lost.id, lostId, lost.approvalId, true)).status, "unknown");
    assert.equal(requests, beforeLostReplay); assert.equal(approved, 3); assert.equal(payloads.length, 2);
    await assert.rejects(sendComputerMessage(owner, lost.id, { requestId: `new-message-${stamp}`, text: "Do not replay an uncertain continuation", files: [], confirmed: true }), error => (error as { code?: string }).code === "task_unconfirmed");
    assert.equal(payloads.length, 2);
    console.log("Approval continuation PG PASS: exact owner/session, one persisted continuation, no decision/send replay, rejection and failed-read stops, unknown receipt and blocking of later messages. Gateway synthetic only.");
  } finally {
    globalThis.fetch = oldFetch;
    await prisma.altazorComputerAction.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.altazorComputerSession.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.altazorComputerWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await prisma.causa.deleteMany({ where: { id: { in: caseIds } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Approval continuation fixture failed"); process.exitCode = 1; });
