import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { normalizeComputerUseApproval } from "./computer-use-approval";
import { KittiesGateway } from "./gateway";
import { DEFAULT_COMPUTER_AUTHORIZATION } from "./authorization-policy";

const scope = { chatId: "fixture-chat", kittyId: "fixture-kitty", binding: "a".repeat(64), revision: 2 };
function approval(args: Record<string, unknown> = { keys: "Return" }) {
  const target = { action: "key", args, binding: scope.binding, chat_id: scope.chatId, kitty: scope.kittyId, policy_revision: scope.revision };
  const action_json = JSON.stringify(target), action_hash = createHash("sha256").update(action_json).digest("hex");
  return { id: "fixture-approval", kind: "computer-use", connector: "lexopen-computer-use", action: "key", args, chat: scope.chatId, kitty: scope.kittyId, status: "pending", computer_action: { version: "v1", binding: scope.binding, policy_revision: 2, category: "input", reason: "unknown_effect", effect_unknown: true, action_hash, action_json } };
}
function policy(extra: Record<string, unknown> = {}) { return { applied: true, chat_id: scope.chatId, kitty: scope.kittyId, binding: scope.binding, revision: 2, mode: "supervised", allow_input: false, allow_browser: false, allow_apps: false, max_actions: 100, max_consultations: 20, actions_used: 0, consultations_used: 1, outcome_unknown: false, ...extra }; }
const code = (expected: string) => (error: unknown) => (error as { code?: string }).code === expected;

test("computer consultations bind original native JSON bytes, action and current scope", () => {
  const original = approval({ text: "<Docencia> y curiosidad" });
  original.computer_action.action_json = original.computer_action.action_json.replace("<", "\\u003c").replace(">", "\\u003e");
  original.computer_action.action_hash = createHash("sha256").update(original.computer_action.action_json).digest("hex");
  const visible = normalizeComputerUseApproval(original, scope);
  assert.equal(visible.computerAction.actionHash, original.computer_action.action_hash);
  assert.deepEqual(visible.args, original.args);
  assert.equal("action_json" in visible.computerAction, false);
  for (const wrong of [{ ...original, chat: "other" }, { ...original, id: 123 }, { ...original, args: { text: "different" } }, { ...original, action: "type_secret" }, { ...original, computer_action: { ...original.computer_action, policy_revision: 3 } }, { ...original, computer_action: { ...original.computer_action, action_hash: "b".repeat(64) } }]) assert.throws(() => normalizeComputerUseApproval(wrong, scope), code("computer_approval_contract"));
});
test("secret fields and raw proof are never projected as a reviewable action", () => {
  const original = approval({ payload: { access_token: "synthetic-must-not-escape" } });
  const visible = normalizeComputerUseApproval(original, scope);
  assert.equal(visible.reviewable, false); assert.equal(JSON.stringify(visible).includes("synthetic-must-not-escape"), false);
  assert.equal(JSON.stringify(visible).includes("action_json"), false);
});
test("supervised semantic document consultations remain bound to their exact local target", () => {
  const selected = approval({ path: "uploads/selected.pdf", offset: 6000, limit: 1000, query: "hechos" });
  selected.action = "document_read";
  selected.computer_action.category = "local_read";
  selected.computer_action.effect_unknown = false;
  const target = JSON.parse(selected.computer_action.action_json); target.action = "document_read";
  selected.computer_action.action_json = JSON.stringify(target);
  selected.computer_action.action_hash = createHash("sha256").update(selected.computer_action.action_json).digest("hex");
  const visible = normalizeComputerUseApproval(selected, scope);
  assert.equal(visible.action, "document_read"); assert.equal(visible.computerAction.category, "local_read");
  assert.equal(visible.reviewable, true); assert.deepEqual(visible.args, selected.args);
  assert.match(visible.summary, /documento/); assert.equal(visible.computerAction.actionHash, selected.computer_action.action_hash);
  assert.throws(() => normalizeComputerUseApproval({ ...selected, args: { ...selected.args, path: "uploads/substituted.pdf" } }, scope), code("computer_approval_contract"));
  assert.throws(() => normalizeComputerUseApproval(selected, { ...scope, revision: scope.revision + 1 }), code("computer_approval_contract"));
});
test("policy capability is mandatory and a GET does not grant or persist anything", async () => {
  const methods: string[] = [];
  const client = new KittiesGateway("http://127.0.0.1:18890", "fixture-token", async (raw, init) => {
    methods.push(init?.method ?? "GET"); const url = new URL(String(raw));
    if (url.pathname === "/v1/health") return Response.json({ ok: true, lexopen_computer_use_policy: "v1" });
    assert.equal(url.searchParams.get("binding"), scope.binding); assert.equal(url.searchParams.get("kitty"), scope.kittyId);
    return Response.json(policy({ applied: false, revision: 0, consultations_used: 0 }));
  });
  assert.equal((await client.computerAuthorization(scope.chatId, scope.kittyId, scope.binding)).applied, false);
  assert.deepEqual(methods, ["GET", "GET"]);
  const unsupported = new KittiesGateway("http://127.0.0.1:18890", "fixture-token", async () => Response.json({ ok: true }));
  await assert.rejects(unsupported.setComputerAuthorization(scope.chatId, scope.kittyId, scope.binding, { ...DEFAULT_COMPUTER_AUTHORIZATION, confirmed: true, expectedRevision: 0 }, 0), code("computer_policy_unsupported"));
});
test("a policy update needs an exact ACK; an uncertain write is never retried", async () => {
  let puts = 0;
  const choice = { ...DEFAULT_COMPUTER_AUTHORIZATION, mode: "intelligent" as const, expectedRevision: 0, confirmed: true as const };
  for (const change of [{}, { mode: "autonomous" }, { revision: 8 }, { binding: "b".repeat(64) }, { outcome_unknown: true }]) {
    const client = new KittiesGateway("http://127.0.0.1:18890", "fixture-token", async (raw, init) => {
      if (new URL(String(raw)).pathname === "/v1/health") return Response.json({ ok: true, lexopen_computer_use_policy: "v1" });
      puts++; assert.equal(init?.method, "PUT"); const body = JSON.parse(String(init?.body));
      assert.equal(body.expected_revision, 1); assert.equal(body.allow_input, false); assert.equal(body.allow_browser, false); assert.equal(body.allow_apps, false);
      return Response.json(policy({ mode: "intelligent", ...change }));
    });
    if (!Object.keys(change).length) assert.equal((await client.setComputerAuthorization(scope.chatId, scope.kittyId, scope.binding, choice, 1)).revision, 2);
    else await assert.rejects(client.setComputerAuthorization(scope.chatId, scope.kittyId, scope.binding, choice, 1), code("computer_policy_unknown"));
  }
  assert.equal(puts, 5);
});
test("an approval sends the exact reviewed hash/revision with always=false", async () => {
  const selected = approval(); let posts = 0;
  const client = new KittiesGateway("http://127.0.0.1:18890", "fixture-token", async (raw, init) => {
    const path = new URL(String(raw)).pathname;
    if (path === "/v1/health") return Response.json({ ok: true, lexopen_computer_use_policy: "v1" });
    if (path.endsWith("/computer-policy")) return Response.json(policy());
    if (path === "/v1/approvals") return Response.json({ approvals: [selected] });
    posts++; assert.equal(init?.method, "POST"); const body = JSON.parse(String(init?.body));
    assert.deepEqual(body, { always: false, computer: { chat_id: scope.chatId, kitty: scope.kittyId, binding: scope.binding, policy_revision: scope.revision, action_hash: selected.computer_action.action_hash } });
    return Response.json({ approval: { ...selected, status: "approved", computer_result: { state: "executed", attempted: true, completed: true, binding: scope.binding, chat_id: scope.chatId, kitty: scope.kittyId, policy_revision: 2, action_hash: selected.computer_action.action_hash } } });
  });
  await assert.rejects(client.decideComputerUseApproval(selected.id, scope.kittyId, scope.chatId, scope.binding, true, { policyRevision: 2, actionHash: "c".repeat(64) }), code("computer_approval_changed")); assert.equal(posts, 0);
  const result = await client.decideComputerUseApproval(selected.id, scope.kittyId, scope.chatId, scope.binding, true, { policyRevision: 2, actionHash: selected.computer_action.action_hash });
  assert.equal(posts, 1); assert.equal(result.semanticOutcomeVerified, false); assert.equal(result.state, "executed");
});
test("persistent physical uncertainty blocks approval without posting another action", async () => {
  let posts = 0;
  const client = new KittiesGateway("http://127.0.0.1:18890", "fixture-token", async (raw, init) => {
    if (init?.method === "POST") posts++;
    return Response.json(new URL(String(raw)).pathname === "/v1/health" ? { ok: true, lexopen_computer_use_policy: "v1" } : policy({ outcome_unknown: true }));
  });
  await assert.rejects(client.decideComputerUseApproval("fixture-approval", scope.kittyId, scope.chatId, scope.binding, true, { actionHash: "a".repeat(64), policyRevision: 2 }), code("computer_outcome_unknown")); assert.equal(posts, 0);
});
