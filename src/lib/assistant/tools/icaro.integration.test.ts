import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { createIcaro, executeIcaroJob } from "@/lib/altazor/icaros/service";
import { runAssistantTurn } from "../pipeline";
import { confirmAltazorTurn, createAltazorTurn, executeAltazorTurn, readAltazorConversation } from "@/lib/altazor/conversations";
import { createAltazorAttachment, deleteAltazorAttachment } from "@/lib/altazor/attachments";
import { icaroDelegarTool, icaroDelegarSchema, resolveIcaroToolInput } from "./icaro";
import type { ToolContext } from "../types";

async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  process.env.LLM_API_URL = "http://127.0.0.1:19996/v1"; process.env.LLM_MODEL = "fixture-icaro"; process.env.LLM_API_KEY = "fictitious-local-only";
  assert.ok(!process.env.S3_BUCKET);
  const previousStorage = process.env.STORAGE_PATH, directory = await mkdtemp(path.join(tmpdir(), "lexopen-icaro-native-")); process.env.STORAGE_PATH = directory;
  const tag = randomUUID(), ids: string[] = [], conversations: string[] = [], plans: string[] = [];
  try {
    const owner = await prisma.user.create({ data: { email: `${tag}@icaros-tool.invalid`, name: "Icaro native owner", role: "abogado", password: "not-a-login" } }); ids.push(owner.id);
    const outsider = await prisma.user.create({ data: { email: `${tag}-other@icaros-tool.invalid`, name: "Icaro outsider", role: "abogado", password: "not-a-login" } }); ids.push(outsider.id);
    const { icaro } = await createIcaro({ requestId: `profile-${tag}`, name: "Revisor", provider: "study", model: "fixture-icaro", confirmed: true }, owner);
    const otherProfile = await createIcaro({ requestId: `other-${tag}`, name: "Revisor", provider: "study", model: "fixture-icaro", confirmed: true }, outsider);
    const conversation = await prisma.altazorConversation.create({ data: { ownerId: owner.id, requestId: `conversation-${tag}`, scopeKey: "personal", title: "Icaro tool native fixture", revision: 2, nextOrdinal: 2 } }); conversations.push(conversation.id);
    const attachment = await createAltazorAttachment(conversation.id, { requestId: `attachment-${tag}`, name: "fictitious-private.txt", bytes: Buffer.from("PARENT_ATTACHMENT_MUST_NOT_COPY") }, owner, prisma);
    const planId = `altazor-${randomUUID()}`; plans.push(planId);
    const text = "Delega a Ícaro Revisor: Prepara una síntesis del encargo explícito.";
    const destination = { provider: "fixture-parent", model: "fixture-parent", endpoint: "http://127.0.0.1:19996/v1", endpointHash: "fictitious-parent-endpoint", remote: false, permitted: true, key: "a".repeat(64) };
    const options = { destination: async () => destination };
    const turn = await prisma.altazorTurn.create({ data: { conversationId: conversation.id, ownerId: owner.id, requestId: `turn-${tag}`, ordinal: 1, inputSha256: "fictitious-turn-hash", userText: text, planId, status: "queued", actorSessionVersion: owner.sessionVersion, contextJson: JSON.stringify({ version: 1, refs: [], attachmentIds: [attachment.attachment.id], memoryDependencies: [], historyTurnIds: [] }), destinationJson: JSON.stringify({ ...destination, allowRemote: false, useMemory: false }) } });
    const ctx: ToolContext = { userId: owner.id, role: "abogado", chatId: conversation.id, nativeTurnId: turn.id, scope: { causaId: null } };
    const prepared = await runAssistantTurn({ text, user: { id: owner.id, role: "abogado" }, chatId: conversation.id, nativeTurnId: turn.id, scope: { causaId: null }, planId, context: "PARENT_CONTEXT_MUST_NOT_COPY", history: [{ role: "assistant", content: "PARENT_HISTORY_MUST_NOT_COPY" }] });
    assert.equal(prepared.clarify, undefined, prepared.clarify); assert.equal(prepared.autoResults, undefined); assert.equal(prepared.previewSteps.length, 1);
    const input = icaroDelegarSchema.parse(prepared.previewSteps[0].input);
    assert.equal(input.icaroId, icaro.id); assert.equal(input.profileRevision, icaro.revision);
    assert.equal((await prisma.altazorIcaroJob.count({ where: { ownerId: owner.id } })), 0, "preparation never enqueues");
    await assert.rejects(icaroDelegarTool.execute(input, ctx), /Confirma este encargo/);
    await assert.rejects(resolveIcaroToolInput({ icaroId: otherProfile.icaro.id, instruction: "Outsider" }, ctx, `Delega a Ícaro ${otherProfile.icaro.id}: Out`), error => (error as { status?: number }).status === 404);
    await prisma.altazorTurn.update({ where: { id: turn.id }, data: { status: "awaiting_confirmation" } });
    const confirmed = await confirmAltazorTurn(conversation.id, turn.id, true, owner, prisma, options);
    assert.equal(confirmed.turns[0].status, "delegating", JSON.stringify(confirmed.turns[0]));
    const jobs = await prisma.altazorIcaroJob.findMany({ where: { ownerId: owner.id } }); assert.equal(jobs.length, 1);
    assert.equal(jobs[0].icaroId, icaro.id); assert.equal(jobs[0].status, "queued"); assert.equal(jobs[0].explicitText, "");
    assert.equal(JSON.stringify(jobs).includes("PARENT_CONTEXT_MUST_NOT_COPY"), false); assert.equal(JSON.stringify(jobs).includes("PARENT_HISTORY_MUST_NOT_COPY"), false);
    assert.deepEqual(JSON.parse(jobs[0].contextJson).origin, { conversationId: conversation.id, turnId: turn.id });
    await confirmAltazorTurn(conversation.id, turn.id, true, owner, prisma, options);
    assert.equal(await prisma.altazorIcaroJob.count({ where: { ownerId: owner.id } }), 1, "repeated confirmation retains one job");
    const read = await readAltazorConversation(conversation.id, owner, prisma, {}, options);
    assert.equal(read.turns[0].results[0].result.card?.jobId, jobs[0].id);
    const childResult = "ICARO_NATIVE_RESULT_FOR_PARENT: síntesis ficticia terminada.";
    await executeIcaroJob(jobs[0].id, owner, { ask: async input => {
      assert.equal(JSON.stringify(input.messages).includes("PARENT_ATTACHMENT_MUST_NOT_COPY"), false);
      return { source: "llm" as const, content: childResult, requireApproval: true, provider: "custom" as const, model: "fixture-icaro" };
    } });
    const finished = await readAltazorConversation(conversation.id, owner, prisma, {}, options);
    assert.equal(finished.turns[0].status, "completed");
    assert.ok(finished.turns[0].assistantText.includes(childResult));
    assert.equal(finished.turns[0].progress?.completed, 1);
    const next = await createAltazorTurn(conversation.id, { requestId: `next-${tag}`, expectedRevision: finished.conversation.revision, text: "Integra el resultado del Ícaro", destinationKey: destination.key, useMemory: false }, owner, prisma, options);
    await executeAltazorTurn(conversation.id, next.turnId, owner, prisma, { ...options, execute: async input => {
      assert.ok(input.history?.some(message => message.role === "assistant" && message.content.includes(childResult)), "el siguiente turno recibe la respuesta terminada del Ícaro");
      return { planId: null, previewSteps: [], autoResults: [{ toolId: "respuesta.libre", result: { ok: true, message: "Síntesis nativa ficticia" } }], streamEvents: [], classification: { source: "rule", toolIds: ["respuesta.libre"], prompt: "fixture" } };
    } });
    await deleteAltazorAttachment(conversation.id, attachment.attachment.id, owner, prisma);
    const hidden = await readAltazorConversation(conversation.id, owner, prisma, {}, options);
    assert.equal(hidden.turns[0].status, "blocked"); assert.equal(hidden.turns[1].status, "blocked");
    assert.equal(JSON.stringify(hidden.turns).includes(childResult), false, "la revocación de una fuente padre oculta respuestas derivadas");
    console.log("Native Icaro integration passed: pinned preview, native confirmation, one queued job, no parent context transfer, completed result aggregation, next-turn recall and derived-source revocation.");
  } finally {
    await prisma.altazorIcaroJob.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.altazorIcaro.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.assistantPlanRecord.deleteMany({ where: { id: { in: plans } } });
    await prisma.altazorConversation.deleteMany({ where: { id: { in: conversations } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
    if (previousStorage === undefined) delete process.env.STORAGE_PATH; else process.env.STORAGE_PATH = previousStorage;
    await rm(directory, { recursive: true, force: true });
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
