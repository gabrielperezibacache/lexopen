/** Owned disposable PostgreSQL; synthetic classifier only, no provider calls. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { digest } from "@/lib/personal-connectors/core";
import { bookMetadataSchema } from "@/lib/books/ingest";
import { importBook, readBook } from "@/lib/books/service";
import { resolveAltazorSources } from "@/lib/altazor/resources";
import { workbenchDestination } from "@/lib/workbench/policy";
import { confirmAltazorTurn, readAltazorConversation } from "@/lib/altazor/conversations";
import { runAssistantTurn } from "../pipeline";
import { academiaCrearTool, academiaListarTool, academiaPrepararTool, resolveAcademicToolInput } from "./academic";
import type { ToolContext } from "../types";

const denied = (error: unknown) => [403, 404, 409, 410].includes(Number((error as { status?: number }).status));
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const storage = await mkdtemp(path.join(tmpdir(), "lexopen-academic-tools-")); process.env.STORAGE_PATH = storage;
  const tag = randomUUID(), userIds: string[] = [], planIds: string[] = [], originalFetch = globalThis.fetch;
  const previousLlm = await prisma.integrationConfig.findUnique({ where: { provider: "llm" } });
  let classifierCalls = 0, intent = { toolId: "academia.crear", confidence: 1, slots: { titulo: "Proyecto académico ficticio", tipo: "research" } as Record<string, unknown> };
  globalThis.fetch = (async raw => {
    const url = new URL(String(raw)); assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "11434");
    classifierCalls++; return Response.json({ choices: [{ message: { content: JSON.stringify({ intents: [intent] }) } }] });
  }) as typeof fetch;
  try {
    const configJson = JSON.stringify({ preset: "custom", apiUrl: "http://127.0.0.1:11434/v1", model: "academic-fixture-only", apiKey: "", requireApproval: true, allowDemo: false });
    await prisma.integrationConfig.upsert({ where: { provider: "llm" }, create: { provider: "llm", enabled: true, configJson }, update: { enabled: true, configJson } });
    const owner = await prisma.user.create({ data: { email: `${tag}@academic-tools.invalid`, name: "Profesional ficticio", role: "abogado", password: "not-a-login" } }); userIds.push(owner.id);
    const other = await prisma.user.create({ data: { email: `${tag}-other@academic-tools.invalid`, name: "Otro profesional", role: "abogado", password: "not-a-login" } }); userIds.push(other.id);
    const conversation = await prisma.altazorConversation.create({ data: { ownerId: owner.id, requestId: tag, scopeKey: "personal", title: "Conversación académica ficticia" } });
    const ctx: ToolContext = { userId: owner.id, role: "abogado", chatId: conversation.id, scope: { causaId: null } };
    const destination = await workbenchDestination(owner.id, "assisted_draft"), options = { destination: async () => destination };
    const sourceBytes = Buffer.from("La investigación jurídica distingue fuentes, inferencias y límites. Texto enteramente ficticio para una prueba local.");
    const imported = await importBook({ ...bookMetadataSchema.parse({ title: "Lectura académica ficticia" }), requestId: tag, name: "ficticia.txt", bytes: sourceBytes }, owner);
    const detail = await readBook(imported.book.id, owner), source = { kind: "book" as const, bookId: imported.book.id, fragmentId: detail.fragments[0].id, quote: detail.fragments[0].text };
    const resolved = await resolveAltazorSources(owner, [source]);
    let ordinal = 0;
    async function plan(text: string, refs: typeof resolved.refs = []) {
      const planId = `altazor-${randomUUID()}`; planIds.push(planId);
      const context = { version: 1, attachmentIds: [], refs, historyTurnIds: [], memoryDependencies: [] };
      const turn = await prisma.altazorTurn.create({ data: { conversationId: conversation.id, ownerId: owner.id, requestId: randomUUID(), ordinal: ++ordinal, inputSha256: digest(text), userText: text, planId, status: "running", leaseToken: "fictitious-lease", leaseExpiresAt: new Date(Date.now() + 60000), contextJson: JSON.stringify(context), destinationJson: JSON.stringify({ ...destination, allowRemote: false, useMemory: false }) } });
      const prepared = await runAssistantTurn({ text, user: { id: owner.id, role: "abogado" }, chatId: conversation.id, scope: ctx.scope, planId, nativeTurnId: turn.id });
      assert.equal(prepared.previewSteps.length, 1, JSON.stringify(prepared));
      await prisma.altazorTurn.update({ where: { id: turn.id }, data: { status: "awaiting_confirmation", leaseToken: null, leaseExpiresAt: null } });
      return { turn, prepared };
    }
    await assert.rejects(academiaCrearTool.execute({ titulo: "Directo sin confirmación", tipo: "research" }, ctx), denied);
    assert.equal(await prisma.altazorAcademicWorkspace.count({ where: { ownerId: owner.id } }), 0);
    const createdPlan = await plan("Crea un proyecto académico ficticio");
    assert.equal(createdPlan.prepared.previewSteps[0].toolId, "academia.crear");
    const beforeCreate = await readAltazorConversation(conversation.id, owner, prisma, {}, options); assert.equal(beforeCreate.turns[0].status, "awaiting_confirmation");
    const created = await confirmAltazorTurn(conversation.id, createdPlan.turn.id, true, owner, prisma, options);
    assert.equal(created.turns[0].status, "completed", JSON.stringify(created.turns[0]));
    const workspace = await prisma.altazorAcademicWorkspace.findFirstOrThrow({ where: { ownerId: owner.id } });
    assert.equal(created.turns[0].results[0].result.card?.href, `/academico?trabajo=${workspace.id}`);
    await confirmAltazorTurn(conversation.id, createdPlan.turn.id, true, owner, prisma, options);
    assert.equal(await prisma.altazorAcademicWorkspace.count({ where: { ownerId: owner.id } }), 1);
    assert.equal((await academiaListarTool.execute({}, ctx)).card?.type, "academia");
    await assert.rejects(academiaListarTool.execute({}, { ...ctx, userId: other.id }), denied);
    intent = { toolId: "academia.preparar", confidence: 1, slots: { trabajoId: workspace.id, mode: "synthesis", instruction: "Sintetiza exclusivamente el pasaje ficticio elegido", expectedRevision: 999, sources: [{ kind: "book", bookId: "inventado" }], destinationKey: "inventado" } };
    const preparePlan = await plan("Prepara una síntesis académica de mi fuente elegida", resolved.refs), step = preparePlan.prepared.previewSteps[0];
    assert.equal(step.toolId, "academia.preparar"); assert.equal(step.input.expectedRevision, workspace.revision); assert.deepEqual(step.input.sources, [source]); assert.equal(step.input.destinationKey, destination.key);
    // Another pending plan in this chat must not supply its source selection.
    const unrelated = await prisma.altazorTurn.create({ data: { conversationId: conversation.id, ownerId: owner.id, requestId: randomUUID(), ordinal: ++ordinal, inputSha256: digest("Otro encargo"), userText: "Otro encargo", status: "awaiting_confirmation", contextJson: JSON.stringify({ version: 1, attachmentIds: [], refs: [], historyTurnIds: [], memoryDependencies: [] }), destinationJson: JSON.stringify(destination) } });
    const exactSelection = await resolveAcademicToolInput("academia.preparar", { trabajoId: workspace.id, mode: "synthesis", instruction: "Encargo ficticio" }, { ...ctx, nativeTurnId: preparePlan.turn.id });
    assert.deepEqual(exactSelection.sources, [source]);
    const unrelatedSelection = await resolveAcademicToolInput("academia.preparar", { trabajoId: workspace.id, mode: "synthesis", instruction: "Otro encargo" }, { ...ctx, nativeTurnId: unrelated.id });
    assert.deepEqual(unrelatedSelection.sources, []);
    await prisma.altazorTurn.update({ where: { id: unrelated.id }, data: { status: "cancelled" } });
    await assert.rejects(academiaPrepararTool.execute(step.input as Parameters<typeof academiaPrepararTool.execute>[0], ctx), denied);
    assert.equal(await prisma.altazorAcademicArtifact.count({ where: { workspaceId: workspace.id } }), 0);
    const beforeConfirmCalls = classifierCalls;
    const prepared = await confirmAltazorTurn(conversation.id, preparePlan.turn.id, true, owner, prisma, options);
    const completedPreparation = prepared.turns.find(turn => turn.id === preparePlan.turn.id)!;
    assert.equal(completedPreparation.status, "completed", JSON.stringify(completedPreparation));
    const artifact = await prisma.altazorAcademicArtifact.findFirstOrThrow({ where: { workspaceId: workspace.id } });
    assert.equal(artifact.status, "prepared"); assert.equal(artifact.body, ""); assert.equal(classifierCalls, beforeConfirmCalls);
    assert.equal(completedPreparation.results[0].result.card?.href, `/academico?trabajo=${workspace.id}&resultado=${artifact.id}`);
    await confirmAltazorTurn(conversation.id, preparePlan.turn.id, true, owner, prisma, options);
    assert.equal(await prisma.altazorAcademicArtifact.count({ where: { workspaceId: workspace.id } }), 1);
    const revokedPlan = await plan("Prepara otra síntesis de la selección", resolved.refs);
    await prisma.libraryBook.update({ where: { id: imported.book.id }, data: { deletedAt: new Date() } });
    await assert.rejects(confirmAltazorTurn(conversation.id, revokedPlan.turn.id, true, owner, prisma, options), denied);
    assert.equal(await prisma.altazorAcademicArtifact.count({ where: { workspaceId: workspace.id } }), 1);
    assert.equal(await prisma.externalShareDraft.count({ where: { ownerId: owner.id } }), 0);
    console.log("Academic tool orchestration PASS: native pipeline, explicit confirmation, durable private project, server-selected sources/provider/revision, no model execution during preparation, replay without duplicates, deep links and revoked-source denial.");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousLlm) await prisma.integrationConfig.update({ where: { provider: "llm" }, data: { enabled: previousLlm.enabled, configJson: previousLlm.configJson } });
    else await prisma.integrationConfig.deleteMany({ where: { provider: "llm" } });
    await prisma.commandExecution.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.assistantPlanRecord.deleteMany({ where: { id: { in: planIds } } });
    await prisma.altazorConversation.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.altazorAcademicWorkspace.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.libraryBook.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect(); await rm(storage, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
