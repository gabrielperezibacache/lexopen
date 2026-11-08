/** Disposable PostgreSQL and a completely synthetic native gateway. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { digest, seal } from "@/lib/personal-connectors/core";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { decideComputerApproval, readComputerActivity, readComputerSession, sendComputerMessage } from "./service";

type Fixture = { id: string; kittyId: string; name: string; chatId: string; approvalId: string; requestId: string | null; task: Record<string, unknown> | null; text: string; approved: boolean; mode: "success" | "missing" | "lost" };
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  process.env.ALTAZOR_COMPUTER_ENABLED = "1";
  const stamp = randomUUID(), users: string[] = [], workspaces: string[] = [], fixtures: Fixture[] = [];
  const endpoint = "http://127.0.0.1:18889", oldFetch = globalThis.fetch;
  const posts: { path: string; body: Record<string, unknown> }[] = [];
  let names: string[] = [], requests = 0;
  globalThis.fetch = (async (raw, init) => {
    requests++; const url = new URL(String(raw)), path = url.pathname;
    assert.equal(url.origin, endpoint); assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-staged-token");
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    if (init?.method === "POST") posts.push({ path, body });
    const kitty = (f: Fixture) => ({ id: f.kittyId, name: f.name, provider: "synthetic-staged-model", desktop: true, container: `kitty-${f.name}`, status: "running", connectors: names, approvals: "ask", backup: "" });
    const approval = (f: Fixture) => ({ id: f.approvalId, kitty: f.kittyId, chat: f.chatId, connector: f.task!.connector, kind: f.task!.kind, action: "download_file", args: { action: "download_file", ...(f.task!.args as object) }, request_id: f.requestId, file_stage_ready: true, status: "pending", at: new Date().toISOString() });
    if (path === "/v1/health") return Response.json({ ok: true, containers: true, version: "synthetic-files.9", lexopen_connector_gate: "v1", lexopen_file_reads: "v1", lexopen_async_messages: "v1", lexopen_staged_file_actions: "v1" });
    if (path === "/v1/providers") return Response.json({ providers: [{ name: "synthetic-staged-model", kind: "ollama" }] });
    if (path === "/v1/kitties") return Response.json({ kitties: fixtures.map(kitty) });
    if (path.startsWith("/v1/kitties/")) { const f = fixtures.find(item => item.kittyId === path.split("/").pop()); assert.ok(f); return Response.json({ kitty: kitty(f) }); }
    if (path.endsWith("/file-actions")) {
      const f = fixtures.find(item => item.chatId === path.split("/")[4]); assert.ok(f); assert.equal(f.requestId, null, "staging must not be replayed");
      f.requestId = String(body.request_id); f.text = String(body.text); f.task = { kind: String(body.connector).includes("-google-") ? "google-workspace" : "github", connector: body.connector, action: body.action, args: body.args };
      if (f.mode === "lost") throw new Error("Synthetic stage acknowledgement lost");
      return Response.json({ state: "pending", approval_id: f.approvalId, request_id: f.requestId });
    }
    if (path === "/v1/approvals") return Response.json({ approvals: fixtures.filter(f => f.requestId && !f.approved).map(approval) });
    if (path.endsWith("/approve")) {
      const f = fixtures.find(item => item.approvalId === path.split("/")[3]); assert.ok(f?.task); assert.equal(f.approved, false, "approval must not be replayed"); f.approved = true;
      const target = f.task.args as Record<string, unknown>, google = f.task.kind === "google-workspace", name = google ? "drive-document.pdf" : "README.md", sha = google ? "a".repeat(64) : "b".repeat(64);
      const receipt = { state: "desktop_verified", request_id: f.requestId, approval_id: f.approvalId, chat_id: f.chatId, kitty: f.kittyId, connector: f.task.connector, kind: f.task.kind, action: "download_file", target, local_path: `/home/kitty/work/imports/${sha}/${name}`, name, bytes: google ? 4200 : 8696, sha256: sha, ...(google ? { pages: 3 } : { first_line: "# Synthetic LexOpen README" }) };
      return Response.json({ approval: { ...approval(f), status: "approved", always: false, ...(f.mode === "missing" ? {} : { structured_receipt: receipt }) } });
    }
    if (path.endsWith("/messages/async")) return Response.json({ request_id: body.request_id, chat_id: path.split("/")[3], status: "accepted", state: "accepted" }, { status: 202 });
    if (path.startsWith("/v1/chats/")) { const f = fixtures.find(item => item.chatId === path.split("/").pop()); assert.ok(f); return Response.json({ chat: { id: f.chatId, members: [f.kittyId], turns: f.requestId ? [{ from: "user", text: f.text, file_request_id: f.requestId }, { from: f.name, kitty: f.kittyId, text: "A model might claim five PDF pages without evidence", working: false, approvals: [{ id: f.approvalId }] }] : [] } }); }
    throw new Error("Unexpected synthetic gateway endpoint");
  }) as typeof fetch;
  try {
    const owner = await prisma.user.create({ data: { email: `${stamp}@staged-file.invalid`, name: "Synthetic file owner", role: "abogado", password: "not-a-login" } }); users.push(owner.id);
    const outsider = await prisma.user.create({ data: { email: `${stamp}-other@staged-file.invalid`, name: "Synthetic outsider", role: "abogado", password: "not-a-login" } }); users.push(outsider.id);
    const id = randomUUID(), scope = "personal";
    await prisma.altazorComputerWorkspace.create({ data: { id, ownerId: owner.id, scopeKey: scope, endpoint, providerName: "synthetic-staged-model", enabled: true, dedicatedDeclaredAt: new Date(), credentialEnc: seal({ token: "synthetic-staged-token" }, `altazor:computer:${owner.id}:${id}:${scope}`) } }); workspaces.push(id);
    const suffix = digest(`${owner.id}:${id}`).slice(0, 16); names = [`altazor-google-${suffix}`, `altazor-github-${suffix}`];
    async function fixture(label: string, mode: Fixture["mode"] = "success") {
      const row = await prisma.altazorComputerSession.create({ data: { ownerId: owner.id, workspaceId: id, requestId: `${stamp}-${label}`, kittyId: `kitty-${label}`, kittyName: `altazor-${label}-${stamp}`, chatId: `chat-${label}`, state: "ready", connectorNamesJson: JSON.stringify(names), expiresAt: new Date(Date.now() + 300_000) } });
      const f: Fixture = { id: row.id, kittyId: row.kittyId!, name: row.kittyName, chatId: row.chatId!, approvalId: `approval-${label}`, requestId: null, task: null, text: "", approved: false, mode }; fixtures.push(f); return f;
    }
    const google = await fixture("google"), text = "Descarga https://docs.google.com/document/d/synthetic-course-program/edit como PDF";
    const beforeDenied = requests; await assert.rejects(sendComputerMessage(outsider, google.id, { requestId: `outsider-${stamp}`, text, files: [], confirmed: true })); assert.equal(requests, beforeDenied);
    const requestId = `download-${stamp}`;
    const staged = await sendComputerMessage(owner, google.id, { requestId, text, files: [], confirmed: true });
    assert.equal(staged.result?.staged, true); assert.equal(google.text, text); assert.deepEqual(google.task?.args, { id: "synthetic-course-program", format: "pdf" });
    assert.equal(posts.some(post => post.path.includes("/messages")), false, "explicit download must not ask a model");
    const savedStage = await prisma.altazorComputerAction.findUniqueOrThrow({ where: { ownerId_requestId: { ownerId: owner.id, requestId } } }); assert.equal(google.requestId, savedStage.id);
    const beforeReplay = posts.length; await sendComputerMessage(owner, google.id, { requestId, text, files: [], confirmed: true }); assert.equal(posts.length, beforeReplay);
    const decisionId = `approve-${stamp}`, decided = await decideComputerApproval(owner, google.id, decisionId, google.approvalId, true);
    assert.equal(decided.result?.canContinue, false); assert.equal((decided.result?.verifiedFile as { pages: number }).pages, 3);
    assert.equal(posts.some(post => post.path.includes("/messages")), false, "staged download must not resume a hallucinating model");
    const view = await readComputerSession(owner, google.id); assert.equal(view.verifiedFiles?.length, 1); assert.equal(view.verifiedFiles?.[0].pages, 3);
    assert.equal(view.turns.some(turn => turn.text.includes("five PDF pages")), true, "source model text is not verification evidence");
    const activity = await readComputerActivity(owner, null, google.id); assert.equal(activity.verifiedFiles?.[0].pages, 3);
    const count = posts.length; await decideComputerApproval(owner, google.id, decisionId, google.approvalId, true); assert.equal(posts.length, count);
    const decision = await prisma.altazorComputerAction.findUniqueOrThrow({ where: { ownerId_requestId: { ownerId: owner.id, requestId: decisionId } } });
    const original = decision.resultJson!; const forged = JSON.parse(original); forged.verifiedFile.chatId = "foreign-chat";
    await prisma.altazorComputerAction.update({ where: { id: decision.id }, data: { resultJson: JSON.stringify(forged) } }); assert.deepEqual((await readComputerSession(owner, google.id)).verifiedFiles, []);
    await prisma.altazorComputerAction.update({ where: { id: decision.id }, data: { resultJson: original } });

    const github = await fixture("github"); await sendComputerMessage(owner, github.id, { requestId: `github-${stamp}`, text: "Descarga el archivo README.md del repositorio fictitious/lexopen desde GitHub", files: [], confirmed: true });
    await decideComputerApproval(owner, github.id, `github-approve-${stamp}`, github.approvalId, true);
    assert.equal((await readComputerSession(owner, github.id)).verifiedFiles?.[0].firstLine, "# Synthetic LexOpen README");

    const missing = await fixture("missing", "missing"); await sendComputerMessage(owner, missing.id, { requestId: `missing-${stamp}`, text, files: [], confirmed: true });
    const missingId = `missing-approve-${stamp}`; await assert.rejects(decideComputerApproval(owner, missing.id, missingId, missing.approvalId, true), error => (error as { code?: string }).code === "file_receipt_unknown");
    assert.equal((await prisma.altazorComputerAction.findUniqueOrThrow({ where: { ownerId_requestId: { ownerId: owner.id, requestId: missingId } } })).status, "unknown");
    const uncertainPosts = posts.length; assert.equal((await decideComputerApproval(owner, missing.id, missingId, missing.approvalId, true)).status, "unknown"); assert.equal(posts.length, uncertainPosts); assert.deepEqual((await readComputerSession(owner, missing.id)).verifiedFiles, []);

    const lost = await fixture("lost", "lost"), lostId = `lost-${stamp}`;
    await assert.rejects(sendComputerMessage(owner, lost.id, { requestId: lostId, text, files: [], confirmed: true })); const lostPosts = posts.length;
    assert.equal((await sendComputerMessage(owner, lost.id, { requestId: lostId, text, files: [], confirmed: true })).status, "unknown"); assert.equal(posts.length, lostPosts);
    await assert.rejects(sendComputerMessage(owner, lost.id, { requestId: `lost-new-${stamp}`, text, files: [], confirmed: true }), error => (error as { code?: string }).code === "task_unconfirmed"); assert.equal(posts.length, lostPosts);
    await assert.rejects(decideComputerApproval(owner, lost.id, `lost-decision-${stamp}`, lost.approvalId, true), error => (error as { code?: string }).code === "file_stage_binding"); assert.equal(posts.length, lostPosts);

    await sendComputerMessage(owner, github.id, { requestId: `fallback-${stamp}`, text: "Organiza un esquema de investigación", files: [], confirmed: true });
    const fallback = posts.at(-1)!; assert.ok(fallback.path.endsWith("/messages/async")); assert.ok(String(fallback.body.text).startsWith("INSTRUCCIONES DEL ENTORNO")); assert.ok(String(fallback.body.text).endsWith("Organiza un esquema de investigación"));
    console.log("Staged files PG PASS: raw original task, exact Google PDF/GitHub targets, zero model calls for downloads, one durable approval, verified files on reload/activity, metadata isolation, missing receipt and lost-response fail closed without replay. Synthetic gateway only.");
  } finally {
    globalThis.fetch = oldFetch;
    await prisma.altazorComputerAction.deleteMany({ where: { ownerId: { in: users } } }); await prisma.altazorComputerSession.deleteMany({ where: { ownerId: { in: users } } }); await prisma.altazorComputerWorkspace.deleteMany({ where: { id: { in: workspaces } } }); await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } }); await prisma.user.deleteMany({ where: { id: { in: users } } }); await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Synthetic staged files fixture failed"); process.exitCode = 1; });
