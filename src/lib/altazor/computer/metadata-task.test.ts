import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { digest } from "@/lib/personal-connectors/core";
import { KittiesGateway, type StagedMetadataApproval } from "./gateway";
import { prepareExplicitMetadataTask, validateExplicitMetadataTask, verifyMetadataReceipt } from "./metadata-task";

const owner = "owner", workspace = "workspace", suffix = digest(`${owner}:${workspace}`).slice(0, 16);
const names = [`altazor-dropbox-${suffix}`, `altazor-microsoft-${suffix}`];
const goal = "Comprueba mi conexión de Dropbox y muestra sólo los nombres de hasta cinco archivos PDF disponibles, sin abrir ni modificar su contenido. Usa la cuenta de Dropbox ya conectada.";
const task = prepareExplicitMetadataTask(goal, owner, workspace, names)!;
const binding = { requestId: "owned-request", approvalId: "owned-approval", chatId: "owned-chat", kittyId: "owned-kitty", task };
const result = JSON.stringify({ schema: "lexopen-cloud-metadata.v1", service: "dropbox", action: "search", items: [{ kind: "folder", name: "folder.pdf" }, { kind: "file", name: "Actual.PDF" }], page_only: true, exhaustive: false, items_truncated: false });
const receipt = () => ({ state: "metadata_ready", request_id: binding.requestId, approval_id: binding.approvalId, chat_id: binding.chatId, kitty: binding.kittyId, connector: task.connector, kind: task.kind, action: task.action, target: { ...task.args }, bytes: Buffer.byteLength(result), sha256: createHash("sha256").update(result).digest("hex") });

test("names-only requests become literal metadata actions for exactly the selected owner and workspace", () => {
  assert.deepEqual(task, { kind: "dropbox", connector: names[0], action: "search", args: { limit: "5", query: ".pdf" } });
  assert.deepEqual(prepareExplicitMetadataTask(goal.replaceAll("Dropbox", "OneDrive"), owner, workspace, names), { ...task, kind: "microsoft-365", connector: names[1] });
  assert.deepEqual(prepareExplicitMetadataTask("Lista hasta tres elementos de Dropbox", owner, workspace, names), { ...task, action: "list", args: { limit: "3" } });
  for (const [who, where, selected] of [["other-owner", workspace, names], [owner, "other-workspace", names], [owner, workspace, []]] as const) assert.equal(prepareExplicitMetadataTask(goal, who, where, selected), null);
  for (const change of [{ args: { query: "el criterio solicitado", limit: "5" } }, { args: { query: ".pdf", limit: "500" } }, { args: { query: ".pdf", limit: "5", path: "/other" } }, { kind: "github" }, { action: "download_file" }]) assert.equal(validateExplicitMetadataTask({ ...task, ...change }, owner, workspace, names), null);
});

function fixture(options: { capability?: boolean; args?: Record<string, string>; missingReceipt?: boolean; forged?: boolean; fileMixed?: boolean; flagsMixed?: boolean; failure?: boolean } = {}) {
  const posts: string[] = [];
  const client = new KittiesGateway("http://127.0.0.1:7494", "fictitious-metadata-token", async (url, init) => {
    const path = new URL(String(url)).pathname;
    if (init?.method === "POST") posts.push(path);
    if (path === "/v1/health") return Response.json({ ok: true, lexopen_connector_gate: "v1", lexopen_staged_file_actions: "v1", ...(options.capability === false ? {} : { lexopen_staged_metadata_actions: "v1" }) });
    if (path.endsWith("/metadata-actions")) { assert.deepEqual(JSON.parse(String(init?.body)), { request_id: binding.requestId, kitty: binding.kittyId, connector: task.connector, action: "search", args: { limit: "5", query: ".pdf" }, text: goal }); return Response.json({ state: "pending", request_id: binding.requestId, approval_id: binding.approvalId }); }
    const approval = { id: binding.approvalId, kitty: binding.kittyId, chat: binding.chatId, connector: task.connector, kind: task.kind, action: task.action, args: { action: task.action, ...(options.args || task.args) }, status: "pending", request_id: binding.requestId, metadata_stage_ready: true, ...(options.flagsMixed ? { file_stage_ready: true } : {}) };
    if (path === "/v1/approvals") return Response.json({ approvals: [approval] });
    assert.ok(path.endsWith("/approve") || path.endsWith("/reject"), "staged metadata never calls a model, browser or download endpoint");
    return Response.json({ approval: { ...approval, status: path.endsWith("/approve") ? "approved" : "rejected", always: false, result, ...(options.failure ? { error: "Synthetic provider failure" } : options.missingReceipt ? {} : { metadata_receipt: { ...receipt(), ...(options.forged ? { request_id: "another-request" } : {}) } }), ...(options.fileMixed ? { structured_receipt: { state: "desktop_verified" } } : {}) } });
  });
  return { client, posts };
}

test("staging checks its capability before any mutation and never starts a model", async () => {
  const old = fixture({ capability: false });
  await assert.rejects(old.client.stageMetadataAction(binding.chatId, binding.kittyId, binding.requestId, task, goal), error => (error as { code?: string }).code === "staged_metadata_actions_required");
  assert.equal(old.posts.length, 0);
  const current = fixture();
  const stage = await current.client.stageMetadataAction(binding.chatId, binding.kittyId, binding.requestId, task, goal);
  assert.equal(stage.metadataStaged, true); assert.deepEqual(stage.metadataTask, task); assert.equal(stage.requestId, binding.requestId); assert.equal(stage.approvalId, binding.approvalId);
  assert.deepEqual(current.posts, [`/v1/lexopen/chats/${binding.chatId}/metadata-actions`]);
});

test("fresh metadata approval requires the exact saved query, account, request and stage kind before executing", async () => {
  const staged: StagedMetadataApproval = { requestId: binding.requestId, metadataTask: task };
  for (const options of [{ args: { query: "el criterio solicitado", limit: "5" } }, { args: { query: ".pdf", limit: "6" } }, { flagsMixed: true }]) {
    const f = fixture(options);
    await assert.rejects(f.client.decideApproval(binding.approvalId, binding.kittyId, binding.chatId, names, true, staged));
    assert.equal(f.posts.length, 0);
  }
  const absent = fixture();
  await assert.rejects(absent.client.decideApproval(binding.approvalId, binding.kittyId, binding.chatId, names, true));
  assert.equal(absent.posts.length, 0, "an unsaved or file-only target cannot approve metadata");
  const good = fixture();
  const decided = await good.client.decideApproval(binding.approvalId, binding.kittyId, binding.chatId, names, true, staged);
  assert.equal(decided.metadataReady, true); assert.equal(decided.canContinue, false); assert.equal(decided.resumeTask, null); assert.equal(decided.verifiedFile, undefined);
  assert.deepEqual(good.posts, [`/v1/approvals/${binding.approvalId}/approve`]);
});

test("metadata success needs a bounded hashed schema receipt, never a model summary or file receipt", async () => {
  assert.equal(verifyMetadataReceipt(receipt(), result, binding).metadataReady, true);
  const excessive = JSON.stringify({ ...JSON.parse(result), items: Array.from({ length: 6 }, (_, index) => ({ kind: "file", name: `File-${index}.pdf` })) });
  assert.throws(() => verifyMetadataReceipt({ ...receipt(), bytes: Buffer.byteLength(excessive), sha256: createHash("sha256").update(excessive).digest("hex") }, excessive, binding), error => (error as { code?: string }).code === "metadata_receipt_unknown", "the response cannot exceed the exact approved count even with a matching hash");
  for (const key of ["request_id", "approval_id", "chat_id", "kitty", "connector", "kind", "action", "sha256"]) assert.throws(() => verifyMetadataReceipt({ ...receipt(), [key]: "foreign" }, result, binding));
  for (const change of [{ target: { query: "other", limit: "5" } }, { target: { query: ".pdf", limit: "5", path: "/wrong" } }, { bytes: Buffer.byteLength(result) + 1 }, { local_path: "/not-a-metadata-file.pdf" }]) assert.throws(() => verifyMetadataReceipt({ ...receipt(), ...change }, result, binding));
  for (const options of [{ missingReceipt: true }, { forged: true }, { fileMixed: true }]) {
    const f = fixture(options);
    await assert.rejects(f.client.decideApproval(binding.approvalId, binding.kittyId, binding.chatId, names, true, { requestId: binding.requestId, metadataTask: task }), error => (error as { code?: string }).code === "metadata_receipt_unknown");
    assert.equal(f.posts.length, 1, "an uncertain completed query is not automatically repeated");
  }
  const failed = fixture({ failure: true });
  const value = await failed.client.decideApproval(binding.approvalId, binding.kittyId, binding.chatId, names, true, { requestId: binding.requestId, metadataTask: task });
  assert.equal(value.failed, true); assert.equal(value.metadataReady, undefined); assert.equal(value.canContinue, false);
});
