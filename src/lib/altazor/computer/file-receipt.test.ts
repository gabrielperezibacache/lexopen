import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeStoredFileReceipt, normalizeVerifiedFileReceipt, type FileReceiptBinding } from "./file-receipt";
import { KittiesGateway, type StagedFileApproval } from "./gateway";
import type { ExplicitFileTask } from "./file-task";

const connector = "altazor-google-0123456789abcdef";
const task: ExplicitFileTask = { kind: "google-workspace", connector, action: "download_file", args: { id: "exact-user-file", format: "pdf", name: "Programa.pdf" } };
const binding: FileReceiptBinding = { requestId: "owned-request", approvalId: "owned-approval", chatId: "owned-chat", kittyId: "owned-kitty", ...task };
const wire = () => ({ state: "desktop_verified", request_id: binding.requestId, approval_id: binding.approvalId, chat_id: binding.chatId, kitty: binding.kittyId, connector, kind: task.kind, action: task.action, target: { ...task.args }, local_path: `/home/kitty/work/imports/${"a".repeat(64)}/Programa.pdf`, name: "Programa.pdf", bytes: 4200, sha256: "a".repeat(64), pages: 3 });
const denied = (error: unknown) => (error as { code?: string }).code === "file_receipt_unknown";

test("verified metadata is scoped, projected and recoverable from a durable receipt", () => {
  const result = normalizeVerifiedFileReceipt(wire(), binding);
  assert.equal(result.pages, 3); assert.equal(result.localPath, wire().local_path); assert.equal(result.bytes, 4200);
  assert.equal(result.requestId, binding.requestId); assert.equal(result.firstLine, undefined);
  assert.deepEqual(normalizeStoredFileReceipt(result, binding), result);
});
test("summaries, missing receipts and forged identity/target cannot confirm a download", () => {
  for (const value of [null, "Downloaded PDF five pages", { output: "Verified desktop file" },
    ...["request_id", "approval_id", "chat_id", "kitty", "connector", "kind", "action", "state"].map(key => ({ ...wire(), [key]: "foreign" })),
    { ...wire(), target: { ...task.args, id: "substituted-file" } }, { ...wire(), target: { ...task.args, token: "not-allowed" } },
    { ...wire(), access_token: "never-project" }, { ...wire(), name: "Other.pdf", local_path: `/home/kitty/work/imports/${"a".repeat(64)}/Other.pdf` },
  ]) assert.throws(() => normalizeVerifiedFileReceipt(value, binding), denied);
  assert.throws(() => normalizeVerifiedFileReceipt(wire(), { ...binding, connector: "altazor-google-fedcba9876543210" }), denied);
});
test("only a bounded content-addressed desktop file may become evidence", () => {
  for (const change of [{ local_path: "/etc/passwd" }, { local_path: wire().local_path.replace("imports", "imports/..") }, { name: "../other.pdf" }, { sha256: "a".repeat(63) }, { bytes: -1 }, { bytes: 4 * 1024 * 1024 + 1 }, { bytes: 2.5 }, { pages: 0 }, { pages: 100001 }, { pages: "5" }, { first_line: "untrusted\nsecond line" }, { first_line: "x".repeat(201) }]) assert.throws(() => normalizeVerifiedFileReceipt({ ...wire(), ...change }, binding), denied);
  const large = { ...wire(), bytes: 4 * 1024 * 1024 };
  assert.equal(normalizeVerifiedFileReceipt(large, binding).bytes, large.bytes);
});
test("a first line is literal bounded text, never parsed as HTML or model evidence", () => {
  const value: Record<string, unknown> = { ...wire(), first_line: '<script>not executed</script> & «literal»' }; delete value.pages;
  assert.equal(normalizeVerifiedFileReceipt(value, binding).firstLine, value.first_line);
  const stored = normalizeVerifiedFileReceipt(value, binding);
  assert.throws(() => normalizeStoredFileReceipt({ ...stored, target: { id: "wrong" } }, binding), denied);
});

function syntheticGateway(options: { capability?: boolean; missing?: boolean; forged?: boolean; failure?: boolean } = {}) {
  const calls: { path: string; method: string; body: Record<string, unknown> }[] = [];
  const fetcher: typeof fetch = async (url, init) => {
    const path = new URL(String(url)).pathname, method = String(init?.method || "GET"), body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    calls.push({ path, method, body });
    if (path === "/v1/health") return Response.json({ ok: true, lexopen_connector_gate: "v1", ...(options.capability === false ? {} : { lexopen_staged_file_actions: "v1" }) });
    if (path.endsWith("/file-actions")) return Response.json({ state: "pending", request_id: body.request_id, approval_id: binding.approvalId });
    const approval = { id: binding.approvalId, kitty: binding.kittyId, chat: binding.chatId, connector, kind: task.kind, action: task.action, args: { action: task.action, ...task.args }, request_id: binding.requestId, file_stage_ready: true, status: "pending" };
    if (path === "/v1/approvals") return Response.json({ approvals: [approval] });
    if (path.endsWith("/approve")) return Response.json({ approval: { ...approval, status: "approved", always: false, ...(options.failure ? { error: "private provider detail" } : options.missing ? {} : { structured_receipt: { ...wire(), ...(options.forged ? { target: { id: "substituted" } } : {}) } }) } });
    throw new Error("A staged download must not call a model or browser endpoint");
  };
  return { client: new KittiesGateway("http://127.0.0.1:7494", "synthetic-token", fetcher), calls };
}
test("an explicit download requires the staged capability before any POST", async () => {
  const { client, calls } = syntheticGateway({ capability: false });
  await assert.rejects(client.stageFileAction(binding.chatId, binding.kittyId, binding.requestId, task, "Descarga este programa"), error => (error as { code?: string }).code === "staged_file_actions_required");
  assert.equal(calls.filter(call => call.method === "POST").length, 0);
});
test("staging preserves the raw user task and exact target without model inference", async () => {
  const { client, calls } = syntheticGateway();
  const result = await client.stageFileAction(binding.chatId, binding.kittyId, binding.requestId, task, "Descarga mi programa académico");
  assert.equal(result.staged, true); assert.equal(result.approvalId, binding.approvalId);
  const post = calls.find(call => call.method === "POST")!;
  assert.deepEqual(post.body, { request_id: binding.requestId, kitty: binding.kittyId, connector, action: "download_file", args: task.args, text: "Descarga mi programa académico" });
});
test("approval validates a typed receipt and never continues the model", async () => {
  const { client, calls } = syntheticGateway(); const staged: StagedFileApproval = { requestId: binding.requestId, task };
  const result = await client.decideApproval(binding.approvalId, binding.kittyId, binding.chatId, [connector], true, staged);
  assert.equal(result.canContinue, false); assert.equal(result.resumeTask, null); assert.equal(result.verifiedFile?.pages, 3);
  assert.equal(calls.filter(call => call.method === "POST").length, 1);
  assert.equal(calls.some(call => call.path.includes("/messages")), false);
});
test("missing/mismatched receipts fail after one decision without an automatic retry", async () => {
  for (const options of [{ missing: true }, { forged: true }]) {
    const { client, calls } = syntheticGateway(options);
    await assert.rejects(client.decideApproval(binding.approvalId, binding.kittyId, binding.chatId, [connector], true, { requestId: binding.requestId, task }), denied);
    assert.equal(calls.filter(call => call.method === "POST").length, 1);
  }
});
test("a native pending action needs its separately saved original target", async () => {
  for (const staged of [undefined, { requestId: "different-request", task }, { requestId: binding.requestId, task: { ...task, args: { id: "different-file" } } }]) {
    const { client, calls } = syntheticGateway();
    await assert.rejects(client.decideApproval(binding.approvalId, binding.kittyId, binding.chatId, [connector], true, staged), error => (error as { code?: string }).code === "file_stage_binding");
    assert.equal(calls.filter(call => call.method === "POST").length, 0);
  }
});
test("a failed native download exposes no receipt or provider detail and does not resume", async () => {
  const { client } = syntheticGateway({ failure: true });
  const result = await client.decideApproval(binding.approvalId, binding.kittyId, binding.chatId, [connector], true, { requestId: binding.requestId, task });
  assert.equal(result.failed, true); assert.equal(result.canContinue, false); assert.equal(result.verifiedFile, undefined);
  assert.equal(JSON.stringify(result).includes("private provider detail"), false);
});

test("approved Dropbox and OneDrive metadata preserve the exact original task for one continuation", async () => {
  const goal = "Muestra sólo cinco nombres de archivos, sin abrir ni modificar su contenido.";
  for (const target of [
    { kind: "dropbox", connector: "altazor-dropbox-0123456789abcdef", action: "list", args: { limit: "5" } },
    { kind: "dropbox", connector: "altazor-dropbox-0123456789abcdef", action: "search", args: { query: "PDF", limit: "5" } },
    { kind: "microsoft-365", connector: "altazor-microsoft-0123456789abcdef", action: "list", args: { limit: "5" } },
    { kind: "microsoft-365", connector: "altazor-microsoft-0123456789abcdef", action: "search", args: { query: "PDF", limit: "5" } },
    { kind: "microsoft-365", connector: "altazor-microsoft-0123456789abcdef", action: "request", args: { method: "GET", path: "/v1.0/me/drive/root/children" } },
  ]) {
    for (const outcome of ["approved", "failed", "rejected"] as const) {
      let decisions = 0, chats = 0;
      const client = new KittiesGateway("http://127.0.0.1:7494", "synthetic-token", async (url, init) => {
        const path = new URL(String(url)).pathname;
        if (path === "/v1/health") return Response.json({ ok: true, lexopen_connector_gate: "v1", lexopen_async_messages: "v1" });
        if (path === "/v1/approvals") return Response.json({ approvals: [{ ...target, id: "metadata-approval", kitty: binding.kittyId, chat: binding.chatId, status: "pending", args: { action: target.action, ...target.args } }] });
        if (path === `/v1/chats/${binding.chatId}`) {
          chats++;
          return Response.json({ chat: { id: binding.chatId, members: [binding.kittyId], turns: [{ from: "user", text: goal }, { from: "altazor", kitty: binding.kittyId, approvals: [{ id: "metadata-approval" }] }] } });
        }
        assert.ok(path.endsWith(outcome === "rejected" ? "/reject" : "/approve"));
        assert.equal(init?.method, "POST"); assert.deepEqual(JSON.parse(String(init.body)), outcome === "rejected" ? { reason: "La persona rechazó esta operación en LexOpen.", always: false } : { always: false });
        decisions++;
        return Response.json({ approval: { id: "metadata-approval", kitty: binding.kittyId, chat: binding.chatId, status: outcome === "rejected" ? "rejected" : "approved", always: false, ...(outcome === "failed" ? { error: "Synthetic provider failure" } : {}) } });
      });
      const result = await client.decideApproval("metadata-approval", binding.kittyId, binding.chatId, [target.connector], outcome !== "rejected");
      assert.equal(decisions, 1); assert.equal(chats, outcome === "rejected" ? 0 : 1);
      assert.equal(result.canContinue, outcome === "approved");
      assert.equal(result.resumeTask, outcome === "rejected" ? null : goal);
      assert.equal(result.verifiedFile, undefined, "metadata is never a verified downloaded file");
    }
  }
});

test("cloud continuation never bypasses file-only policy, account selection or generated alias binding", async () => {
  for (const target of [
    { kind: "dropbox", connector: "altazor-dropbox-0123456789abcdef", action: "upload", args: { path: "/must-not-write.pdf" } },
    { kind: "microsoft-365", connector: "altazor-microsoft-0123456789abcdef", action: "request", args: { method: "GET", path: "/v1.0/me/messages" } },
    { kind: "dropbox", connector: "altazor-microsoft-0123456789abcdef", action: "list", args: { limit: "5" } },
  ]) {
    let posts = 0;
    const client = new KittiesGateway("http://127.0.0.1:7494", "synthetic-token", async (url, init) => {
      if (init?.method === "POST") posts++;
      if (new URL(String(url)).pathname === "/v1/health") return Response.json({ ok: true, lexopen_connector_gate: "v1" });
      return Response.json({ approvals: [{ ...target, id: "blocked-approval", kitty: binding.kittyId, chat: binding.chatId, status: "pending", args: { action: target.action, ...target.args } }] });
    });
    await assert.rejects(client.decideApproval("blocked-approval", binding.kittyId, binding.chatId, [target.connector], true), error => (error as { code?: string }).code === "connector_read_only");
    assert.equal(posts, 0);
  }
});

test("Dropbox receipts preserve the exact account path and reject substitutions or unverified summaries", () => {
  const dropbox: FileReceiptBinding = { ...binding, kind: "dropbox", connector: "altazor-dropbox-0123456789abcdef", args: { path: "/Docencia/Programa de teoría.pdf" } };
  const receipt = { ...wire(), connector: dropbox.connector, kind: dropbox.kind, target: { ...dropbox.args } };
  const verified = normalizeVerifiedFileReceipt(receipt, dropbox);
  assert.equal(verified.target.path, dropbox.args.path); assert.equal(verified.pages, 3); assert.equal(verified.sha256, receipt.sha256); assert.equal(verified.bytes, receipt.bytes);
  assert.deepEqual(normalizeStoredFileReceipt(verified, dropbox), verified);
  for (const forged of [{ ...receipt, target: { path: "/Docencia/Other.pdf" } }, { ...receipt, target: { ...dropbox.args, id: "invented" } }, { ...receipt, connector: "altazor-dropbox-fedcba9876543210" }, { ...receipt, local_path: "/tmp/claimed.pdf" }, { output: "PDF downloaded, five pages" }]) assert.throws(() => normalizeVerifiedFileReceipt(forged, dropbox), denied);
  const special = { ...dropbox, args: { path: '/Docencia/Teoría & <prueba> "citada".pdf' } };
  const nativeJson = JSON.stringify({ ...receipt, target: special.args }).replaceAll("&", "\\u0026").replaceAll("<", "\\u003c").replaceAll(">", "\\u003e");
  assert.equal(normalizeVerifiedFileReceipt(JSON.parse(nativeJson), special).target.path, special.args.path, "Go JSON escaping must not change the original literal target");
});
test("Dropbox staging requires both the staged-transfer and cloud-file capability before any POST", async () => {
  const dropbox: ExplicitFileTask = { kind: "dropbox", connector: "altazor-dropbox-0123456789abcdef", action: "download_file", args: { path: "/Docencia/Curso.pdf" } };
  for (const cloud of [false, true]) {
    let posts = 0;
    const client: KittiesGateway = new KittiesGateway("http://127.0.0.1:7494", "synthetic-token", async (url, init): Promise<Response> => {
      if (new URL(String(url)).pathname === "/v1/health") return Response.json({ ok: true, lexopen_staged_file_actions: "v1", ...(cloud ? { lexopen_cloud_file_oauth: "v1" } : {}) });
      posts++; assert.equal(init?.method, "POST"); assert.deepEqual(JSON.parse(String(init?.body)).args, dropbox.args);
      return Response.json({ state: "pending", request_id: binding.requestId, approval_id: binding.approvalId });
    });
    const operation = client.stageFileAction(binding.chatId, binding.kittyId, binding.requestId, dropbox, 'Descarga el archivo "/Docencia/Curso.pdf" de Dropbox');
    if (cloud) { assert.equal((await operation).staged, true); assert.equal(posts, 1); }
    else { await assert.rejects(operation, error => (error as { code?: string }).code === "cloud_file_oauth_required"); assert.equal(posts, 0); }
  }
});
