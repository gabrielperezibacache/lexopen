/** Real disposable PostgreSQL authorization; cloud replies are synthetic. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { digest } from "@/lib/personal-connectors/core";
import { storePlan } from "../plan-store";
import { authorizeCommittedResult } from "../secure-tool";
import { createDriveTools, driveGuardarDocumentoSchema, driveCrearCarpetaSchema } from "./drive";
import type { AssistantPlan, ToolContext } from "../types";
import type { getCaseDriveState, executeCaseDriveCommand, CaseDriveCommand } from "@/lib/integrations/case-drive";

const denied = (error: unknown) => [403, 404, 409].includes(Number((error as { status?: number }).status));
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const stamp = randomUUID(), users: string[] = [], cases: string[] = [], plans: string[] = [];
  let ordinal = 0, stateReads = 0, externalWrites = 0, folderPresent = true, caseRevision = "c".repeat(64), sourceSha = "a".repeat(64), accountRevision = "b".repeat(64), canManage = true, remote = false, unknown = false, throwAfterSend = false;
  const calls: CaseDriveCommand[] = [], receipts = new Map<string, Awaited<ReturnType<typeof executeCaseDriveCommand>>>();
  try {
    const owner = await prisma.user.create({ data: { name: "Drive tool fixture", email: `${stamp}@drive-tool.invalid`, role: "abogado", password: "not-a-login" } }); users.push(owner.id);
    const outsider = await prisma.user.create({ data: { name: "Other fixture", email: `${stamp}-other@drive-tool.invalid`, role: "abogado", password: "not-a-login" } }); users.push(outsider.id);
    const cause = await prisma.causa.create({ data: { titulo: "Drive tool case", tribunal: "Fixture", materia: "civil", abogadoId: owner.id, acceso: "equipo" } }); cases.push(cause.id);
    const otherCase = await prisma.causa.create({ data: { titulo: "Other case", tribunal: "Fixture", materia: "civil", abogadoId: outsider.id, acceso: "equipo" } }); cases.push(otherCase.id);
    const conversation = await prisma.altazorConversation.create({ data: { ownerId: owner.id, requestId: `conversation-${stamp}`, causaId: cause.id, scopeKey: `causa:${cause.id}`, title: "Drive tool" } });
    const doc = await prisma.documento.create({ data: { causaId: cause.id, autorId: owner.id, nombre: "Contrato.pdf", mimeType: "application/pdf", storageKey: "synthetic-original", version: 1 } });
    const foreignDoc = await prisma.documento.create({ data: { causaId: otherCase.id, autorId: outsider.id, nombre: "Other.pdf", storageKey: "synthetic-other-original" } });
    const ctx: ToolContext = { userId: owner.id, role: "abogado", chatId: conversation.id, scope: { causaId: cause.id } };
    const state: typeof getCaseDriveState = async (causaId, user, _options, documentoId) => {
      stateReads++; assert.equal(causaId, cause.id); assert.equal(user.id, owner.id);
      const source = documentoId ? await prisma.documento.findUniqueOrThrow({ where: { id: documentoId } }) : undefined;
      return { causaId, account: "altazor", connected: true, canRead: true, canManage, connectionId: "fictitious-drive-account", bindingRevision: accountRevision, caseRevision, canConfigure: true, reason: null, folder: folderPresent ? { id: "fixture_folder", name: "Expediente", url: "https://drive.google.com/drive/folders/fixture_folder" } : null,
        ...(source ? { document: { id: source.id, name: source.nombre, version: source.version, sourceSha256: sourceSha, bytes: 14, mime: "application/pdf", canSave: true, reason: null, remoteTargetState: remote ? "ready" : "none", ...(remote ? { remoteId: "fixture_previous", remoteVersion: "11" } : {}) } } : {}) } as Awaited<ReturnType<typeof getCaseDriveState>>;
    };
    const command: typeof executeCaseDriveCommand = async (causaId, user, input) => {
      assert.equal(causaId, cause.id); assert.equal(user.id, owner.id); calls.push(input);
      const old = receipts.get(input.requestId); if (old) return old;
      externalWrites++;
      const result: Awaited<ReturnType<typeof executeCaseDriveCommand>> = { state: unknown ? "unknown" : "completed", operationId: `fixture-${externalWrites}`, message: unknown ? "Resultado pendiente; no se repite automáticamente." : "Copia verificada." };
      receipts.set(input.requestId, result);
      if (throwAfterSend) throw new Error("Synthetic acknowledgement lost after an outgoing write");
      return result;
    };
    const tools = createDriveTools({ state, command });
    async function approved(toolId: "drive.guardarDocumento" | "drive.crearCarpeta", raw: Record<string, unknown>) {
      const input = await tools.resolveInput(toolId, raw, ctx);
      const tool = toolId === "drive.crearCarpeta" ? tools.crear : tools.guardar;
      const preview = await tool.preview(input as never, ctx), planId = `altazor-${randomUUID()}`;
      const plan: AssistantPlan = { id: planId, intents: [{ toolId, confidence: 1, slots: {} }], steps: [{ toolId, input, preview }], needsConfirm: true };
      plans.push(planId); await storePlan(plan, owner.id);
      await prisma.altazorTurn.updateMany({ where: { conversationId: conversation.id, status: "running" }, data: { status: "completed", leaseToken: null, leaseExpiresAt: null } });
      const turn = await prisma.altazorTurn.create({ data: { ownerId: owner.id, conversationId: conversation.id, requestId: `turn-${stamp}-${ordinal}`, ordinal: ++ordinal, inputSha256: digest(preview), userText: "Synthetic approved task", planId, status: "running", leaseToken: "fixture-running-lease", leaseExpiresAt: new Date(Date.now() + 60_000) } });
      const context: ToolContext = { ...ctx, nativeTurnId: turn.id, commandKey: `assistant-plan:${planId}:0`, authorizeContext: async () => { const current = await prisma.altazorTurn.findUniqueOrThrow({ where: { id: turn.id } }); if (current.status !== "running" || current.cancelRequestedAt || !current.leaseToken || !current.leaseExpiresAt || current.leaseExpiresAt <= new Date()) throw Object.assign(new Error("Cancelled or expired fixture turn"), { status: 409 }); } };
      return { tool, input, preview, plan, turn, context };
    }
    assert.match((await tools.estado.execute({}, ctx)).message, /Carpeta vinculada: Expediente/);
    await assert.rejects(tools.estado.execute({}, { ...ctx, scope: { causaId: null } }), denied);
    await assert.rejects(tools.resolveInput("drive.guardarDocumento", { documentoId: foreignDoc.id }, ctx), denied);
    await assert.rejects(tools.resolveInput("drive.guardarDocumento", {}, ctx), denied);
    const duplicate = await prisma.documento.create({ data: { causaId: cause.id, autorId: owner.id, nombre: doc.nombre } });
    await assert.rejects(tools.resolveInput("drive.guardarDocumento", { documento: "Contrato.pdf" }, ctx), denied);
    await prisma.documento.delete({ where: { id: duplicate.id } });
    const prepared = await approved("drive.guardarDocumento", { documento: "Contrato.pdf", connectionId: "model-invented-account", sourceSha256: "model-invented-sha" });
    assert.equal(prepared.input.connectionId, "fictitious-drive-account"); assert.equal(prepared.input.sourceSha256, sourceSha);
    assert.match(prepared.preview, /Contrato.pdf/); assert.match(prepared.preview, /El original de LexOpen y sus citas se conservan/);
    await assert.rejects(tools.guardar.execute(prepared.input as never, ctx), denied); assert.equal(externalWrites, 0);
    for (const change of [{ nombre: "Different.pdf" }, { sourceSha256: "0".repeat(64) }, { folderId: "different_folder" }]) await assert.rejects(tools.guardar.execute({ ...prepared.input, ...change } as never, prepared.context), denied);
    await assert.rejects(tools.guardar.execute(prepared.input as never, { ...prepared.context, commandKey: `assistant-plan:${prepared.plan.id}:1` }), denied);
    await prisma.altazorTurn.update({ where: { id: prepared.turn.id }, data: { cancelRequestedAt: new Date() } });
    await assert.rejects(tools.guardar.execute(prepared.input as never, prepared.context), denied);
    await prisma.altazorTurn.update({ where: { id: prepared.turn.id }, data: { cancelRequestedAt: null, leaseExpiresAt: new Date(0) } });
    await assert.rejects(tools.guardar.execute(prepared.input as never, prepared.context), denied);
    await prisma.altazorTurn.update({ where: { id: prepared.turn.id }, data: { leaseExpiresAt: new Date(Date.now() + 60_000) } });
    for (const change of ["case", "account", "source"] as const) {
      const saved = [caseRevision, accountRevision, sourceSha];
      if (change === "case") caseRevision = "d".repeat(64); if (change === "account") accountRevision = "e".repeat(64); if (change === "source") sourceSha = "f".repeat(64);
      await assert.rejects(tools.guardar.execute(prepared.input as never, prepared.context), denied);
      [caseRevision, accountRevision, sourceSha] = saved;
    }
    assert.equal(externalWrites, 0);
    await prisma.documento.update({ where: { id: doc.id }, data: { version: 2 } });
    await assert.rejects(tools.guardar.execute(prepared.input as never, prepared.context), denied);
    await prisma.documento.update({ where: { id: doc.id }, data: { version: 1 } });
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "causa.write" } });
    await assert.rejects(tools.guardar.execute(prepared.input as never, prepared.context), denied);
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: owner.capabilityRevokes } });
    await prisma.assistantPlanRecord.update({ where: { id: prepared.plan.id }, data: { planJson: JSON.stringify({ ...prepared.plan, steps: [{ ...prepared.plan.steps[0], preview: "Different reviewed destination" }] }) } });
    await assert.rejects(tools.guardar.execute(prepared.input as never, prepared.context), denied);
    await prisma.assistantPlanRecord.update({ where: { id: prepared.plan.id }, data: { planJson: JSON.stringify(prepared.plan) } });
    const result = await tools.guardar.execute(prepared.input as never, prepared.context); assert.equal(result.ok, true);
    await tools.guardar.execute(prepared.input as never, prepared.context);
    assert.equal(externalWrites, 1); assert.equal(calls[0].requestId, calls[1].requestId); assert.match(calls[0].requestId, /^assistant-drive-[a-f0-9]{64}$/);
    const reads = stateReads; await authorizeCommittedResult("drive.guardarDocumento", prepared.input, result, ctx, prisma); assert.equal(stateReads, reads, "history authorization never accesses Drive or repeats egress");
    await prisma.documento.update({ where: { id: doc.id }, data: { confidencial: true } });
    await assert.rejects(authorizeCommittedResult("drive.guardarDocumento", prepared.input, result, ctx, prisma), denied);
    await prisma.documento.update({ where: { id: doc.id }, data: { confidencial: false } });
    canManage = false; await assert.rejects(tools.resolveInput("drive.guardarDocumento", { documentoId: doc.id }, ctx), denied); canManage = true;
    remote = true; const revision = await tools.resolveInput("drive.guardarDocumento", { documentoId: doc.id }, ctx); assert.equal(revision.action, "save-version"); assert.equal(revision.expectedVersion, "11"); remote = false;
    unknown = true; const uncertain = await approved("drive.guardarDocumento", { documentoId: doc.id });
    assert.equal((await tools.guardar.execute(uncertain.input as never, uncertain.context)).ok, false); const sent = externalWrites;
    await tools.guardar.execute(uncertain.input as never, uncertain.context); assert.equal(externalWrites, sent, "an unknown result uses the same durable receipt rather than repeating a cloud write"); unknown = false;
    throwAfterSend = true; const lost = await approved("drive.guardarDocumento", { documentoId: doc.id }); const lostResult = await tools.guardar.execute(lost.input as never, lost.context); assert.equal(lostResult.ok, false); assert.match(lostResult.message, /no se repetirá automáticamente/); throwAfterSend = false;
    await assert.rejects(tools.resolveInput("drive.crearCarpeta", { nombre: "New" }, ctx), denied);
    folderPresent = false; const folder = await approved("drive.crearCarpeta", { nombre: "Expediente nuevo" });
    driveCrearCarpetaSchema.parse(folder.input); driveGuardarDocumentoSchema.parse(prepared.input);
    await tools.crear.execute(folder.input as never, folder.context); assert.equal(calls.at(-1)?.action, "create-folder");
    assert.equal(await prisma.altazorComputerSession.count({ where: { ownerId: owner.id } }), 0, "Host Drive tools never require or create a desktop");
    console.log("Assistant Drive PG PASS: exact source resolution, source/account/case snapshots, confirmed plan+lease+current ACL, reserved document denial, stable one-use command keys and unknown outcomes. Cloud replies are simulated; no desktop created.");
  } finally {
    await prisma.altazorConversation.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.assistantPlanRecord.deleteMany({ where: { id: { in: plans } } });
    await prisma.documento.deleteMany({ where: { causaId: { in: cases } } });
    await prisma.causa.deleteMany({ where: { id: { in: cases } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
