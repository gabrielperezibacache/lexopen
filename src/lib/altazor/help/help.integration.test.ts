import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { sha256Hex } from "@/lib/notify/secrets";
import { getHelpChannelConfig, saveHelpChannelConfig, saveWhatsAppMetaConfig } from "./config";
import { answerHelpRequest, claimHelpResponse, completeHelpResponse, createHelpRequest, getHelpRequest, helpWorkerQueue, notifyHelpRequest, pollHelpReplies } from "./service";
import { createWhatsAppHelpLink, processWhatsAppHelpWebhook } from "./whatsapp";
import type { createWhatsAppMetaProvider } from "@/lib/notify/providers/whatsapp";
import { reconcileComputerHelp } from "./reconciler";
import type { ComputerSessionView } from "../computer/types";
import { publishNtfy } from "@/lib/notify/providers/ntfy";
import type { fetchSafeOutbound } from "@/lib/net/safe-url";

const isStatus = (status: number) => (error: unknown) => (error as { status?: number }).status === status;
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const client = new PrismaClient({ datasources: { db: { url } } }), tag = randomUUID(), ids: string[] = [];
  const oldKey = process.env.LEXOPEN_SECRETS_KEY;
  process.env.LEXOPEN_SECRETS_KEY = "altazor-help-fictitious-encryption-key";
  let organizationId = "", sessionId = "", workspaceId = "", oldCaseId = "", oldConversationId = "", publishCalls = 0, whatsAppCalls = 0, notifiedText = "";
  const oldFetch = globalThis.fetch;
  globalThis.fetch = (async () => { throw Error("No network permitted in help fixtures"); }) as typeof fetch;
  try {
    const owner = await client.user.create({ data: { name: "Help owner", email: `${tag}-owner@help.invalid`, password: "not-a-login", role: "abogado" } });
    const other = await client.user.create({ data: { name: "Other owner", email: `${tag}-other@help.invalid`, password: "not-a-login", role: "abogado" } });
    const admin = await client.user.create({ data: { name: "Host", email: `${tag}-admin@help.invalid`, password: "not-a-login", role: "admin" } });
    ids.push(owner.id, other.id, admin.id);
    organizationId = (await client.organization.create({ data: { name: "Help fixture", settings: { create: { assistantLlmMode: "remote_allowed", require2faPrivileged: false } } } })).id;
    const workspace = await client.altazorComputerWorkspace.create({ data: { ownerId: owner.id, scopeKey: "personal", endpoint: `https://${tag}.fixture.invalid`, providerName: "fixture", enabled: true, dedicatedDeclaredAt: new Date() } }); workspaceId = workspace.id;
    const session = await client.altazorComputerSession.create({ data: { ownerId: owner.id, workspaceId, requestId: tag, kittyName: `help-${tag}`, state: "ready", expiresAt: null } }); sessionId = session.id;
    const input = { requestKey: `session:${session.id}:turn:1:fingerprint`, question: "Private document fixture that must never leave the Host", computerSessionId: session.id, computerTurnId: "1", scopeKind: "workspace" as const, scopeId: workspace.id };
    const request = await createHelpRequest(owner, input, client);
    assert.equal((await createHelpRequest(owner, input, client)).id, request.id, "detecting the same help does not create another request");
    await assert.rejects(createHelpRequest(other, input, client), isStatus(409));
    await assert.rejects(getHelpRequest(other, request.id, client), isStatus(404));
    await saveHelpChannelConfig(owner, { ntfy: { enabled: true, baseUrl: "https://ntfy.fixture.invalid", topic: "altazor_notices_fixture", replyTopic: "altazor_replies_fixture", token: "fictitious-ntfy-token" } }, client);
    const encrypted = await client.integrationConfig.findUniqueOrThrow({ where: { provider: `altazor-help:${sha256Hex(owner.id)}` } });
    assert.equal(encrypted.configJson.includes("fictitious-ntfy-token"), false);
    const ntfyInput = { enabled: true, baseUrl: "https://ntfy.fixture.invalid", topic: "altazor_notices_fixture", replyTopic: "altazor_replies_fixture" };
    await assert.rejects(saveHelpChannelConfig(owner, { ntfy: { ...ntfyInput, baseUrl: "https://new-ntfy.fixture.invalid" } }, client), isStatus(400));
    assert.equal((await getHelpChannelConfig(owner.id, client)).ntfy?.baseUrl, ntfyInput.baseUrl, "changing server without a fresh token never changes stored credential binding");
    await saveHelpChannelConfig(owner, { ntfy: { ...ntfyInput, topic: "altazor_topic_changed", token: "" } }, client);
    assert.equal((await getHelpChannelConfig(owner.id, client)).ntfy?.token, "fictitious-ntfy-token", "changing only the topic on the same server may retain the token");
    await saveHelpChannelConfig(owner, { ntfy: { ...ntfyInput, enabled: false, baseUrl: "https://new-ntfy.fixture.invalid", token: "" } }, client);
    assert.equal((await getHelpChannelConfig(owner.id, client)).ntfy?.token, "", "changing a disabled server clears its previous token");
    await assert.rejects(saveHelpChannelConfig(owner, { ntfy: { ...ntfyInput, baseUrl: "https://new-ntfy.fixture.invalid" } }, client), isStatus(400));
    await saveHelpChannelConfig(owner, { ntfy: { ...ntfyInput, baseUrl: "https://new-ntfy.fixture.invalid", token: "fictitious-new-server-token" } }, client);
    await publishNtfy((await getHelpChannelConfig(owner.id, client)).ntfy!, { title: "Fixture", body: "Minimal fixture" }, (async (url, init) => {
      assert.equal(new URL(url).origin, "https://new-ntfy.fixture.invalid");
      assert.equal(new Headers(init?.headers).get("authorization"), "Bearer fictitious-new-server-token");
      assert.equal(new Headers(init?.headers).get("authorization")?.includes("fictitious-ntfy-token"), false, "the previous server credential cannot reach the new host");
      return Response.json({ id: "fixture-server-binding" });
    }) as typeof fetchSafeOutbound);
    await saveHelpChannelConfig(owner, { ntfy: { ...ntfyInput, token: "fictitious-ntfy-token" } }, client);
    const oldCase = await client.causa.create({ data: { titulo: "Revoked help case", tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); oldCaseId = oldCase.id;
    const oldConversation = await client.altazorConversation.create({ data: { ownerId: owner.id, requestId: `old-conversation-${tag}`, causaId: oldCase.id, scopeKey: `causa:${oldCase.id}`, title: "Old scoped help" } }); oldConversationId = oldConversation.id;
    const oldHelp = await createHelpRequest(owner, { requestKey: "old-case-help", question: "Old help whose case access will be revoked", conversationId: oldConversation.id, scopeKind: "causa", scopeId: oldCase.id }, client);
    await client.altazorHelpRequest.update({ where: { id: oldHelp.id }, data: { createdAt: new Date(Date.now() - 2 * 60_000) } });
    await client.causa.update({ where: { id: oldCase.id }, data: { abogadoId: other.id } });
    const transports = {
      publishNtfy: async (_config: unknown, message: { title: string; body: string }) => { publishCalls++; notifiedText = message.body; assert.equal(message.body.includes(input.question), false); assert.equal(message.body.includes(owner.email), false); return { ok: true as const, providerMessageId: "ntfy-notice" }; },
      createWhatsAppMetaProvider: (() => ({ id: "whatsapp_meta", limits: { globalPerSec: 5 }, health: async () => ({ ok: true }), send: async (message: { text: string }) => { whatsAppCalls++; notifiedText = message.text; return { ok: true as const, providerMessageId: "wamid.sent-fixture" }; } })) as typeof createWhatsAppMetaProvider,
    };
    await Promise.all([notifyHelpRequest(owner.id, request.id, client, transports), notifyHelpRequest(owner.id, request.id, client, transports)]);
    assert.equal(publishCalls, 1, "notification claim prevents duplicate publication");
    const code = /ALTAZOR ([A-Za-z0-9_-]{32})/.exec(notifiedText)![1];
    await assert.rejects(answerHelpRequest(owner, { requestId: request.id, response: "😀".repeat(501) }, client), isStatus(400));
    assert.equal((await getHelpRequest(owner, request.id, client)).status, "pending", "oversized UTF-8 replies cannot consume the pause");
    let pollCalls = 0;
    assert.equal((await pollHelpReplies(owner, client, async (_config, since) => { pollCalls++; assert.equal(since.toISOString(), request.createdAt, "poll starts from the oldest authorized request, never the revoked one"); return [{ id: "wrong", time: Date.now() / 1000, message: `ALTAZOR ${"x".repeat(32)} wrong` }]; })).accepted, 0);
    assert.equal(pollCalls, 1, "an older revoked scope cannot prevent polling a current request");
    assert.equal((await client.altazorHelpRequest.findUniqueOrThrow({ where: { id: oldHelp.id } })).status, "cancelled");
    const replies = async () => [{ id: "reply-one", time: Math.floor(Date.now() / 1000), message: `ALTAZOR ${code} Continúa con la opción indicada` }];
    assert.equal((await pollHelpReplies(owner, client, replies)).accepted, 1);
    assert.equal((await pollHelpReplies(owner, client, replies)).accepted, 0, "replay cannot answer twice");
    const answered = await getHelpRequest(owner, request.id, client);
    assert.equal(answered.status, "answered", "poll records the answer but never resumes execution");
    assert.equal(JSON.stringify(answered).includes(code), false, "public state never exposes the reply capability");
    const claims = await Promise.all([claimHelpResponse(owner, request.id, client), claimHelpResponse(owner, request.id, client)]);
    assert.equal(claims.filter(Boolean).length, 1);
    await completeHelpResponse(owner, request.id, true, client);
    assert.equal((await getHelpRequest(owner, request.id, client)).status, "resumed");
    assert.equal((await answerHelpRequest(owner, { requestId: request.id, response: "Replay" }, client)).accepted, false);

    const revoked = await createHelpRequest(owner, { ...input, requestKey: "revoked", computerTurnId: "2" }, client);
    await client.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "assistant.use" } });
    await assert.rejects(answerHelpRequest(owner, { requestId: revoked.id, response: "Stale permission" }, client), isStatus(403));
    await client.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });
    const expired = await createHelpRequest(owner, { ...input, requestKey: "expired", computerTurnId: "3" }, client);
    await client.altazorHelpRequest.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    assert.equal((await answerHelpRequest(owner, { requestId: expired.id, response: "Too late" }, client)).accepted, false);
    assert.equal((await getHelpRequest(owner, expired.id, client)).status, "expired");
    const crash = await createHelpRequest(owner, { ...input, requestKey: "crashed", computerTurnId: "4" }, client);
    await client.altazorHelpRequest.update({ where: { id: crash.id }, data: { notificationStatus: "sending", notificationAttemptedAt: new Date(Date.now() - 3 * 60_000) } });
    await helpWorkerQueue(client);
    await notifyHelpRequest(owner.id, crash.id, client, transports);
    assert.equal(publishCalls, 1, "an uncertain previous delivery is not blindly sent again");
    const failed = await createHelpRequest(owner, { ...input, requestKey: "failed-delivery", computerTurnId: "failed" }, client);
    let failedAttempts = 0;
    const failedTransports = { ...transports, publishNtfy: async () => { failedAttempts++; return { ok: false as const, retryable: true, error: "Fictitious rejection" }; } };
    assert.equal((await notifyHelpRequest(owner.id, failed.id, client, failedTransports)).notificationStatus, "failed");
    await notifyHelpRequest(owner.id, failed.id, client, failedTransports);
    assert.equal(failedAttempts, 1, "failed delivery requires explicit review rather than automatic resend");
    const restricted = await createHelpRequest(owner, { ...input, requestKey: "local-only", computerTurnId: "5" }, client);
    await client.firmSettings.update({ where: { organizationId }, data: { assistantLlmMode: "local_only" } });
    assert.equal((await notifyHelpRequest(owner.id, restricted.id, client, transports)).notificationStatus, "restricted");
    assert.equal(publishCalls, 1);
    await client.firmSettings.update({ where: { organizationId }, data: { assistantLlmMode: "remote_allowed" } });
    assert.equal((await notifyHelpRequest(owner.id, restricted.id, client, transports)).notificationStatus, "notified", "a policy-blocked wait can notify when remote help is permitted again");
    assert.equal(publishCalls, 2);

    await saveWhatsAppMetaConfig(admin, { enabled: true, phoneNumberId: "12345678901", apiVersion: "v23.0", templateName: "altazor_help", templateLanguage: "es", accessToken: "fictitious-meta-access", appSecret: "fictitious-meta-secret", verifyToken: "fictitious-verify-token-at-least-24" }, client);
    const link = await createWhatsAppHelpLink(owner, client);
    const webhook = (text: string, id: string, from = "56911111111", contextId?: string) => JSON.stringify({ object: "whatsapp_business_account", entry: [{ changes: [{ value: { metadata: { phone_number_id: "12345678901" }, messages: [{ id, from, type: "text", timestamp: String(Math.floor(Date.now() / 1000)), text: { body: text }, ...(contextId ? { context: { id: contextId } } : {}) }] } }] }] });
    const signed = (raw: string) => `sha256=${createHmac("sha256", "fictitious-meta-secret").update(raw).digest("hex")}`;
    const rawLink = webhook(link.message, "wamid.link");
    await assert.rejects(processWhatsAppHelpWebhook(rawLink, "sha256=invalid", client), isStatus(401));
    assert.equal((await processWhatsAppHelpWebhook(rawLink, signed(rawLink), client)).linked, 1);
    assert.equal((await processWhatsAppHelpWebhook(rawLink, signed(rawLink), client)).linked, 0, "phone link code is consumed exactly once");
    const channel = await client.canalUsuario.findFirstOrThrow({ where: { userId: owner.id, canal: "whatsapp", estado: "activo" } });
    await saveHelpChannelConfig(owner, { ntfy: { enabled: false, baseUrl: "https://ntfy.fixture.invalid", topic: "altazor_notices_fixture", replyTopic: "altazor_replies_fixture" }, whatsapp: { enabled: true, channelId: channel.id } }, client);
    const waRequest = await createHelpRequest(owner, { ...input, requestKey: "whatsapp", computerTurnId: "6" }, client);
    await notifyHelpRequest(owner.id, waRequest.id, client, transports);
    assert.equal(whatsAppCalls, 1);
    assert.equal(notifiedText.includes(input.question), false);
    const waCode = /ALTAZOR ([A-Za-z0-9_-]{32})/.exec(notifiedText)![1];
    const wrongSender = webhook(`ALTAZOR ${waCode} Wrong sender`, "wamid.wrong", "56922222222");
    assert.equal((await processWhatsAppHelpWebhook(wrongSender, signed(wrongSender), client)).accepted, 0);
    const waReply = webhook("Continúa", "wamid.reply", "56911111111", "wamid.sent-fixture");
    assert.equal((await processWhatsAppHelpWebhook(waReply, signed(waReply), client)).accepted, 1);
    assert.equal((await processWhatsAppHelpWebhook(waReply, signed(waReply), client)).accepted, 0);
    assert.equal((await getHelpRequest(owner, waRequest.id, client)).status, "answered");
    assert.equal((await getHelpChannelConfig(other.id, client)).ntfy, null, "another account never inherits mobile channels");
    const notConfigured = await createHelpRequest(other, { requestKey: "wait-before-channel-setup", question: "Wait for my mobile channel" }, client);
    assert.equal((await notifyHelpRequest(other.id, notConfigured.id, client, transports)).notificationStatus, "unconfigured");
    const beforeChannelSetup = publishCalls;
    await saveHelpChannelConfig(other, { ntfy: { ...ntfyInput, topic: "other_altazor_notices_fixture", replyTopic: "other_altazor_replies_fixture", token: "fictitious-other-token" } }, client);
    assert.equal((await notifyHelpRequest(other.id, notConfigured.id, client, transports)).notificationStatus, "notified", "a previously unconfigured wait notifies after the owner connects a channel");
    assert.equal(publishCalls, beforeChannelSetup + 1);
    await notifyHelpRequest(other.id, notConfigured.id, client, transports);
    assert.equal(publishCalls, beforeChannelSetup + 1, "a completed notification is not repeated after configuration changes");

    let resumes = 0, answerOnPoll = false, outcome = "completed", readCount = 0, changeDuringPoll = false;
    const view: ComputerSessionView = { runtime: "container", kittyStatus: "running", working: true, approvals: [], session: { id: session.id, state: "ready", held: false, expiresAt: null, persistent: true, renewableUntil: null, canRenew: false, createdAt: session.createdAt.toISOString(), connectors: [] }, turns: [{ index: 10, from: "assistant", text: "Plan inicial que no cambia.", working: true, needsHelp: false, help: { stepIndex: 0, question: "Necesito una indicación para continuar." }, steps: [{ action: "ask_help", at: new Date().toISOString() }] }] };
    const deps = {
      client,
      read: async () => { readCount++; if (changeDuringPoll && readCount % 2 === 0) return { ...view, turns: [{ ...view.turns[0], help: { stepIndex: view.turns[0].help!.stepIndex + 1, question: "La pregunta cambió durante la consulta." } }] }; return structuredClone(view); },
      notify: (id: string, helpId: string, db = client) => notifyHelpRequest(id, helpId, db, transports),
      poll: async () => {
        if (!answerOnPoll) return { accepted: 0 };
        const pending = await client.altazorHelpRequest.findFirst({ where: { ownerId: owner.id, computerSessionId: session.id, computerTurnId: String(view.turns[0].index), status: "pending" }, orderBy: { createdAt: "desc" } });
        return { accepted: pending && (await answerHelpRequest(owner, { requestId: pending.id, response: "La indicación válida" }, client)).accepted ? 1 : 0 };
      },
      resume: async (_actor: unknown, _sessionId: string, resumed: { requestId: string; turnIndex: number; response: string }) => {
        resumes++;
        assert.equal(resumed.turnIndex, view.turns[0].index);
        assert.equal((await client.altazorHelpRequest.findUniqueOrThrow({ where: { id: resumed.requestId } })).status, "resuming");
        return { status: outcome };
      },
    };
    assert.equal((await reconcileComputerHelp({ ownerId: owner.id }, deps)).resumed, 0);
    assert.equal(resumes, 0, "detecting a help request pauses rather than resumes");
    answerOnPoll = true;
    assert.equal((await reconcileComputerHelp({ ownerId: owner.id }, deps)).resumed, 1);
    await reconcileComputerHelp({ ownerId: owner.id }, deps);
    assert.equal(resumes, 1, "a repeated worker pass never sends the response twice");
    view.turns[0] = { ...view.turns[0], help: { stepIndex: 1, question: "Segunda ayuda del mismo turno y plan." } };
    assert.equal((await reconcileComputerHelp({ ownerId: owner.id }, deps)).resumed, 1);
    assert.equal(resumes, 2, "a later ask_help step gets its own request even when turn index and plan text are unchanged");
    view.turns[0] = { ...view.turns[0], index: 11, help: { stepIndex: 2, question: "Pregunta que quedará obsoleta." } };
    readCount = 0; changeDuringPoll = true;
    await reconcileComputerHelp({ ownerId: owner.id }, deps);
    assert.equal(resumes, 2, "a changed gateway question cannot consume a previously accepted mobile response");
    const stale = await client.altazorHelpRequest.findFirstOrThrow({ where: { ownerId: owner.id, computerSessionId: session.id, computerTurnId: "11" } });
    changeDuringPoll = false; answerOnPoll = false;
    view.turns[0] = { ...view.turns[0], index: 12, help: { stepIndex: 3, question: "Nueva pregunta vigente." } };
    await reconcileComputerHelp({ ownerId: owner.id }, deps);
    assert.equal((await client.altazorHelpRequest.findUniqueOrThrow({ where: { id: stale.id } })).status, "cancelled");
    answerOnPoll = true; outcome = "unknown";
    await reconcileComputerHelp({ ownerId: owner.id }, deps);
    assert.equal(resumes, 3);
    const unknown = await client.altazorHelpRequest.findFirstOrThrow({ where: { ownerId: owner.id, computerSessionId: session.id, computerTurnId: "12" } });
    assert.equal(unknown.status, "resume_failed");
    await reconcileComputerHelp({ ownerId: owner.id }, deps);
    assert.equal(resumes, 3, "an uncertain gateway outcome is never retried automatically");
    view.turns[0] = { ...view.turns[0], index: 13, working: false, needsHelp: true, help: undefined };
    await reconcileComputerHelp({ ownerId: owner.id }, deps);
    assert.equal(resumes, 3, "a terminal needs_help flag has no live response channel and cannot resume");
    assert.equal(await client.altazorHelpRequest.count({ where: { ownerId: owner.id, computerSessionId: session.id, computerTurnId: "13" } }), 0);
    view.session.held = true;
    view.turns[0] = { ...view.turns[0], index: 14, working: true, help: { stepIndex: 4, question: "Pregunta bajo control manual." } };
    await reconcileComputerHelp({ ownerId: owner.id }, deps);
    assert.equal(resumes, 3, "manual control always prevents automatic resumption");
    const audit = await client.auditEvent.findMany({ where: { actorId: owner.id } });
    assert.equal(JSON.stringify(audit).includes(input.question), false);
    assert.equal(JSON.stringify(audit).includes("Continúa"), false);
    console.log("Altazor help integration passed: durable/idempotent waits and delivery, encrypted per-user channels, no document in notifications, owner/scope/revocation, one-use replies, no auto-resume on poll, replay/expiry/crash handling and signed WhatsApp binding/correlation; no real messages.");
  } finally {
    globalThis.fetch = oldFetch;
    await client.altazorHelpRequest.deleteMany({ where: { ownerId: { in: ids } } });
    await client.integrationConfig.deleteMany({ where: { provider: { in: [...ids.map(id => `altazor-help:${sha256Hex(id)}`), "whatsapp_meta"] } } });
    await client.canalUsuario.deleteMany({ where: { userId: { in: ids } } });
    await client.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    if (sessionId) await client.altazorComputerSession.delete({ where: { id: sessionId } });
    if (workspaceId) await client.altazorComputerWorkspace.delete({ where: { id: workspaceId } });
    if (oldConversationId) await client.altazorConversation.delete({ where: { id: oldConversationId } });
    if (oldCaseId) await client.causa.delete({ where: { id: oldCaseId } });
    if (organizationId) await client.organization.delete({ where: { id: organizationId } });
    await client.user.deleteMany({ where: { id: { in: ids } } });
    await client.$disconnect();
    if (oldKey === undefined) delete process.env.LEXOPEN_SECRETS_KEY; else process.env.LEXOPEN_SECRETS_KEY = oldKey;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
