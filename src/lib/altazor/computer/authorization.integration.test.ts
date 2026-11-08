/** Disposable PostgreSQL; every gateway response and account is synthetic. */
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { seal } from "@/lib/personal-connectors/core";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { DEFAULT_COMPUTER_AUTHORIZATION } from "./authorization-policy";
import type { ComputerAuthorizationSettings } from "./types";
import { applySavedComputerAuthorization, computerAuthorizationBinding, readComputerAuthorization, saveComputerAuthorization } from "./authorization-service";
import { KittiesGateway } from "./gateway";
import { decideComputerUseApproval, readComputerActivity, sendComputerMessage } from "./service";

const has = (code: string) => (error: unknown) => (error as { code?: string }).code === code;
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  process.env.ALTAZOR_COMPUTER_ENABLED = "1";
  const stamp = randomUUID(), endpoint = "http://127.0.0.1:18892", originalFetch = globalThis.fetch;
  const userIds: string[] = [], workspaceIds: string[] = [], settings: string[] = [];
  let puts = 0, messages = 0, decisions = 0, working = false, lostPut = false, outcome = false, revision = 0, sessionId = "", kittyName = "";
  let current: ComputerAuthorizationSettings = { ...DEFAULT_COMPUTER_AUTHORIZATION }; let pending: Record<string, unknown> | null = null;
  let nativeBinding = "", chatId = "", kittyId = "";
  const native = (binding = nativeBinding) => ({ applied: revision > 0, chat_id: chatId, kitty: kittyId, binding, revision, mode: current.mode, allow_input: current.allowInput, allow_browser: current.allowBrowser, allow_apps: current.allowApps, max_actions: current.maxActions, max_consultations: current.maxConsultations, actions_used: 0, consultations_used: pending ? 1 : 0, gui_effects_unknown: current.allowInput, outcome_unknown: outcome });
  globalThis.fetch = (async (raw, init) => {
    const url = new URL(String(raw)), path = url.pathname, method = init?.method ?? "GET";
    assert.equal(url.origin, endpoint); assert.equal(new Headers(init?.headers).get("authorization"), "Bearer synthetic-policy-token");
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    if (path === "/v1/health") return Response.json({ ok: true, containers: true, version: "synthetic-policy.11", lexopen_computer_use_policy: "v1", lexopen_async_messages: "v1" });
    if (path === "/v1/providers") return Response.json({ providers: [{ name: "fixture-policy-model", kind: "ollama" }] });
    const kitty = { id: kittyId, name: kittyName, provider: "fixture-policy-model", desktop: true, container: `kitty-${kittyName}`, status: "running", connectors: ["-"], approvals: "ask", backup: "" };
    if (path === "/v1/kitties") return Response.json({ kitties: kittyId ? [kitty] : [] });
    if (path.startsWith("/v1/kitties/")) return Response.json({ kitty });
    if (path.endsWith("/computer-policy")) {
      if (method === "GET") return Response.json(native(String(url.searchParams.get("binding"))));
      assert.equal(method, "PUT"); assert.equal(body.expected_revision, revision); puts++;
      nativeBinding = String(body.binding); revision++;
      current = { mode: body.mode as typeof current.mode, allowInput: body.allow_input === true, allowBrowser: body.allow_browser === true, allowApps: body.allow_apps === true, maxActions: Number(body.max_actions), maxConsultations: Number(body.max_consultations) };
      if (lostPut) { lostPut = false; throw new Error("Synthetic acknowledgement lost after applying"); }
      return Response.json(native());
    }
    if (path === "/v1/approvals") return Response.json({ approvals: pending ? [pending] : [] });
    if (path.endsWith("/approve") || path.endsWith("/reject")) {
      decisions++; assert.ok(pending); const selected = pending; pending = null;
      const meta = selected.computer_action as Record<string, unknown>;
      assert.deepEqual(body.computer, { chat_id: chatId, kitty: kittyId, binding: nativeBinding, policy_revision: revision, action_hash: meta.action_hash }); assert.equal(body.always, false);
      return Response.json({ approval: { ...selected, status: path.endsWith("/approve") ? "approved" : "rejected", computer_result: { state: path.endsWith("/approve") ? "executed" : "rejected", attempted: path.endsWith("/approve"), completed: path.endsWith("/approve"), action_hash: meta.action_hash, policy_revision: revision, binding: nativeBinding, chat_id: chatId, kitty: kittyId } } });
    }
    if (path.endsWith("/messages/async")) { messages++; return Response.json({ request_id: body.request_id, chat_id: chatId, status: "accepted", state: "accepted" }, { status: 202 }); }
    if (path === `/v1/chats/${chatId}`) return Response.json({ chat: { id: chatId, members: [kittyId], turns: working ? [{ from: kittyName, text: "Synthetic working", working: true }] : [] } });
    throw new Error("Unexpected synthetic policy endpoint");
  }) as typeof fetch;
  try {
    const owner = await prisma.user.create({ data: { email: `${stamp}@computer-policy.invalid`, name: "Synthetic authorization owner", password: "not-a-login", role: "abogado" } }); userIds.push(owner.id);
    const other = await prisma.user.create({ data: { email: `${stamp}-other@computer-policy.invalid`, name: "Synthetic outsider", password: "not-a-login", role: "abogado" } }); userIds.push(other.id);
    const id = randomUUID(), workspace = await prisma.altazorComputerWorkspace.create({ data: { id, ownerId: owner.id, scopeKey: "personal", endpoint, enabled: true, dedicatedDeclaredAt: new Date(), providerName: "fixture-policy-model", credentialEnc: seal({ token: "synthetic-policy-token" }, `altazor:computer:${owner.id}:${id}:personal`) } }); workspaceIds.push(id); settings.push(`altazor-computer-policy:${id}`);
    nativeBinding = computerAuthorizationBinding(workspace);
    const choice = (expectedRevision: number) => ({ ...DEFAULT_COMPUTER_AUTHORIZATION, mode: "intelligent" as const, expectedRevision, confirmed: true as const });
    const initial = await readComputerAuthorization(owner, id, true); assert.equal(initial.state, "default"); assert.equal(puts, 0); assert.equal(await prisma.integrationConfig.count({ where: { provider: settings[0] } }), 0, "GET must not persist a grant");
    await assert.rejects(saveComputerAuthorization(other, id, `foreign-${stamp}`, choice(0))); assert.equal(puts, 0);
    const saved = await saveComputerAuthorization(owner, id, `save-${stamp}`, choice(0)); assert.equal(saved.authorization.state, "saved"); assert.equal(saved.authorization.revision, 1); assert.equal(puts, 0);
    const session = await prisma.altazorComputerSession.create({ data: { ownerId: owner.id, workspaceId: id, requestId: `start-${stamp}`, kittyId: `kitty-${stamp}`, kittyName: `altazor-${stamp}`, state: "starting", connectorNamesJson: '["-"]', expiresAt: new Date(Date.now() + 300_000) } }); sessionId = session.id; kittyId = session.kittyId!; kittyName = session.kittyName; chatId = `chat-${stamp}`; settings.push(`altazor-computer-policy-ack:${sessionId}`);
    await applySavedComputerAuthorization(owner, workspace, session.id, chatId, kittyId, new KittiesGateway(endpoint, "synthetic-policy-token")); assert.equal(puts, 1);
    await prisma.altazorComputerSession.update({ where: { id: session.id }, data: { chatId, state: "ready" } });
    assert.equal((await readComputerAuthorization(owner, id, true)).state, "applied");
    await assert.rejects(saveComputerAuthorization(owner, id, `stale-${stamp}`, choice(0)), has("computer_policy_changed")); assert.equal(puts, 1);
    working = true; await assert.rejects(saveComputerAuthorization(owner, id, `busy-${stamp}`, choice(1)), has("task_busy")); working = false; assert.equal(puts, 1);
    const autonomous = { ...choice(1), mode: "autonomous" as const, allowInput: true, guiEffectsAcknowledged: true };
    const updated = await saveComputerAuthorization(owner, id, `autonomous-${stamp}`, autonomous); assert.equal(updated.authorization.state, "applied"); assert.equal(updated.authorization.applied?.allowInput, true); assert.equal(puts, 2);
    const actionJson = JSON.stringify({ action: "key", args: { keys: "Return" }, binding: nativeBinding, chat_id: chatId, kitty: kittyId, policy_revision: revision }), actionHash = createHash("sha256").update(actionJson).digest("hex");
    pending = { id: `approval-${stamp}`, kind: "computer-use", connector: "lexopen-computer-use", action: "key", args: { keys: "Return" }, chat: chatId, kitty: kittyId, status: "pending", computer_action: { version: "v1", binding: nativeBinding, policy_revision: revision, category: "input", reason: "unknown_effect", effect_unknown: true, action_hash: actionHash, action_json: actionJson } };
    const activity = await readComputerActivity(owner, null, session.id); assert.equal(activity.state, "approval"); assert.match(activity.consultation!.reason, /ratón o teclado/);
    await assert.rejects(saveComputerAuthorization(owner, id, `waiting-${stamp}`, choice(2)), has("computer_policy_consultation")); assert.equal(puts, 2);
    const decisionRequest = `decision-${stamp}`;
    const decision = await decideComputerUseApproval(owner, session.id, decisionRequest, String(pending.id), true, { actionHash, policyRevision: revision }); assert.equal(decision.status, "completed"); assert.equal(decision.result?.semanticOutcomeVerified, false); assert.equal(decisions, 1); assert.equal(messages, 0, "approval must not launch another model continuation");
    await decideComputerUseApproval(owner, session.id, decisionRequest, `approval-${stamp}`, true, { actionHash, policyRevision: revision }); assert.equal(decisions, 1, "one-use receipt survives replay");
    // Native uncertainty can arise after a message was already accepted locally.
    outcome = true;
    const uncertain = await readComputerAuthorization(owner, id, true); assert.equal(uncertain.state, "unknown"); assert.equal(uncertain.canConfigure, false); assert.equal((await readComputerActivity(owner, null, session.id)).outcomeUnknown, true);
    await assert.rejects(saveComputerAuthorization(owner, id, `uncertain-policy-${stamp}`, choice(2)), has("computer_outcome_unknown")); assert.equal(puts, 2);
    await assert.rejects(sendComputerMessage(owner, session.id, { requestId: `uncertain-task-${stamp}`, text: "Prepara un resumen académico", files: [], confirmed: true }), has("computer_outcome_unknown")); assert.equal(messages, 0);
    await prisma.altazorComputerSession.update({ where: { id: session.id }, data: { state: "closed" } });
    // A lost policy ACK remains unknown; GET never replays it or calls it applied.
    kittyId = ""; chatId = ""; outcome = false; revision = 0; current = { ...DEFAULT_COMPUTER_AUTHORIZATION };
    await saveComputerAuthorization(owner, id, `next-${stamp}`, choice(2));
    const second = await prisma.altazorComputerSession.create({ data: { ownerId: owner.id, workspaceId: id, requestId: `second-${stamp}`, kittyId: `kitty-second-${stamp}`, kittyName: `altazor-second-${stamp}`, chatId: `chat-second-${stamp}`, state: "ready", connectorNamesJson: '["-"]', expiresAt: new Date(Date.now() + 300_000) } }); sessionId = second.id; kittyId = second.kittyId!; kittyName = second.kittyName; chatId = second.chatId!; settings.push(`altazor-computer-policy-ack:${second.id}`);
    lostPut = true; const lostId = `lost-${stamp}`;
    await assert.rejects(saveComputerAuthorization(owner, id, lostId, choice(3))); const writes = puts;
    assert.equal((await readComputerAuthorization(owner, id, true)).state, "unknown");
    assert.equal((await saveComputerAuthorization(owner, id, lostId, choice(3))).status, "unknown"); assert.equal(puts, writes, "uncertain PUT is never automatically retried");
    await assert.rejects(sendComputerMessage(owner, second.id, { requestId: `after-lost-${stamp}`, text: "Abre el navegador", files: [], confirmed: true }), has("computer_policy_pending")); assert.equal(messages, 0);
    // A separate, explicitly confirmed choice can supersede a lost policy ACK.
    assert.equal((await saveComputerAuthorization(owner, id, `reviewed-${stamp}`, choice(4))).authorization.state, "applied"); assert.equal(puts, writes + 1);
    revision++; assert.equal((await readComputerAuthorization(owner, id, true)).state, "mismatch", "matching mode without exact signed revision is not applied");
    await assert.rejects(sendComputerMessage(owner, second.id, { requestId: `stale-native-${stamp}`, text: "Abre el navegador", files: [], confirmed: true }), has("computer_policy_unconfirmed")); assert.equal(messages, 0);
    const stored = await prisma.integrationConfig.findUniqueOrThrow({ where: { provider: settings[0] } }), corrupt = JSON.parse(stored.configJson); corrupt.choice.allowBrowser = true;
    await prisma.integrationConfig.update({ where: { provider: settings[0] }, data: { configJson: JSON.stringify(corrupt) } });
    const invalid = await readComputerAuthorization(owner, id, true); assert.equal(invalid.state, "unknown"); assert.equal(invalid.canConfigure, false);
    assert.equal((await readComputerActivity(owner, null, second.id)).monitor, true, "a malformed policy must not hide the supervisor monitor");
    assert.equal((await prisma.integrationConfig.findUniqueOrThrow({ where: { provider: settings[0] } })).configJson, JSON.stringify(corrupt), "a read must not repair or broaden saved permissions");
    console.log("Computer authorization PG: scoped persistence, exact ACK, one-use review, physical uncertainty, lost ACK and revision mismatch PASS");
  } finally {
    globalThis.fetch = originalFetch;
    await prisma.integrationConfig.deleteMany({ where: { provider: { in: settings } } });
    if (workspaceIds.length) {
      await prisma.altazorComputerAction.deleteMany({ where: { session: { workspaceId: { in: workspaceIds } } } });
      await prisma.altazorComputerSession.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.altazorConnectorOperation.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
      await prisma.altazorComputerWorkspace.deleteMany({ where: { id: { in: workspaceIds } } });
    }
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
