/** Real PostgreSQL checks: rollback, duplicate requests, current ACL and stale undo. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";

async function main() {
  const connection = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  process.env.DATABASE_URL = connection;
  const { prisma } = await import("@/lib/db");
  const { getTool } = await import("./tools/registry");
  const { storePlan, getPlan, cancelPlan } = await import("./plan-store");
  const prefix = `assistant-${randomUUID()}`;
  const userA = await prisma.user.create({ data: { id: `${prefix}-a`, email: `${prefix}-a@example.invalid`, name: "Fixture A", role: "socio", password: "fixture-never-used" } });
  const userB = await prisma.user.create({ data: { id: `${prefix}-b`, email: `${prefix}-b@example.invalid`, name: "Fixture B", role: "asistente", password: "fixture-never-used" } });
  const userC = await prisma.user.create({ data: { id: `${prefix}-c-user`, email: `${prefix}-c@example.invalid`, name: "Fixture C", role: "abogado", password: "fixture-never-used" } });
  const causa = await prisma.causa.create({ data: { id: `${prefix}-c`, titulo: "Synthetic matter", tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: userC.id } });
  const hidden = await prisma.causa.create({ data: { id: `${prefix}-hidden`, titulo: "Hidden synthetic matter", tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: userB.id } });
  const common = await prisma.causa.create({ data: { id: `${prefix}-common`, titulo: "Readable matter with scoped privilege", tribunal: "Fixture", materia: "civil", acceso: "estudio", abogadoId: userB.id } });
  const cliente = await prisma.cliente.create({ data: { id: `${prefix}-client`, razonSocial: "Synthetic client" } });
  const ctx = { userId: userA.id, role: "socio" as const };
  let failAudit = false;
  prisma.$use(async (params, next) => {
    if (failAudit && params.model === "AuditEvent" && params.action === "create" && params.args?.data?.actorId === userA.id) throw new Error("synthetic audit failure");
    return next(params);
  });
  const createdIds: string[] = [];
  const recoveryCausaId = `${prefix}-recover`;
  const deleteRecoveryCausaId = `${prefix}-delete-recover`;
  try {
    const noteTool = getTool("nota.crear");
    failAudit = true;
    await assert.rejects(() => noteTool.execute({ causaId: causa.id, titulo: "Must rollback", contenido: "synthetic" }, { ...ctx, commandKey: `${prefix}:rollback` }));
    assert.equal(await prisma.nota.count({ where: { causaId: causa.id } }), 0);
    assert.equal(await prisma.activity.count({ where: { causaId: causa.id } }), 0);
    assert.equal(await prisma.commandExecution.count({ where: { ownerId: userA.id } }), 0, "receipt rolls back too");
    assert.equal(await prisma.assistantUndo.count({ where: { ownerId: userA.id } }), 0);
    // Nested minuta creation must use the same TX as its document and audit.
    await assert.rejects(() => getTool("minuta.crear").execute({ causaId: causa.id, titulo: "Rollback minuta", resumenEjecutivo: "fixture" }, { ...ctx, commandKey: `${prefix}:minuta-rollback` }));
    assert.equal(await prisma.minuta.count({ where: { causaId: causa.id } }), 0);
    assert.equal(await prisma.documento.count({ where: { causaId: causa.id } }), 0);
    failAudit = false;

    const input = { causaId: causa.id, titulo: "Same command", contenido: "synthetic" };
    const results = await Promise.all([noteTool.execute(input, { ...ctx, commandKey: `${prefix}:same` }), noteTool.execute(input, { ...ctx, commandKey: `${prefix}:same` })]);
    assert.equal(results[0].entityId, results[1].entityId);
    assert.equal(await prisma.nota.count({ where: { causaId: causa.id, titulo: "Same command" } }), 1);
    assert.equal(await prisma.auditEvent.count({ where: { actorId: userA.id, action: "nota.create" } }), 1);
    await assert.rejects(() => noteTool.execute({ ...input, contenido: "different payload" }, { ...ctx, commandKey: `${prefix}:same` }), (error: unknown) => (error as { status?: number }).status === 409);
    const note = results[0];
    assert.ok(note.undoToken);
    await assert.rejects(() => noteTool.undo!(note.undoToken!, { userId: userB.id, role: "asistente" }), (error: unknown) => (error as { status?: number }).status === 404);
    assert.equal((await prisma.assistantUndo.findUnique({ where: { id: note.undoToken! } }))?.consumedAt, null);
    await prisma.nota.update({ where: { id: note.entityId! }, data: { contenido: "newer colleague edit" } });
    await assert.rejects(() => noteTool.undo!(note.undoToken!, ctx), (error: unknown) => (error as { status?: number }).status === 409);
    assert.equal((await prisma.nota.findUnique({ where: { id: note.entityId! } }))?.contenido, "newer colleague edit");

    const reversible = await noteTool.execute({ ...input, titulo: "Concurrent undo" }, { ...ctx, commandKey: `${prefix}:undo` });
    assert.ok(await prisma.nota.findUnique({ where: { id: reversible.entityId! } }), JSON.stringify(reversible));
    const { relatedCausaWhere } = await import("@/lib/auth/causa-access");
    assert.ok(await prisma.nota.findFirst({ where: { id: reversible.entityId!, ...relatedCausaWhere({ id: userA.id, role: "socio" }) } }));
    const undone = await Promise.allSettled([noteTool.undo!(reversible.undoToken!, ctx), noteTool.undo!(reversible.undoToken!, ctx)]);
    assert.equal(undone.filter((r) => r.status === "fulfilled").length, 1, JSON.stringify(undone.map((r) => r.status === "rejected" ? { status: r.reason.status, message: r.reason.message } : r.value)));
    assert.equal(await prisma.nota.count({ where: { id: reversible.entityId! } }), 0);
    await assert.rejects(() => getTool("causa.resumen").execute({ causaId: causa.id }, { userId: userB.id, role: "asistente" }), (error: unknown) => (error as { status?: number }).status === 404);

    // Revoke current access after token creation; a stale token is not authority.
    const doc = await prisma.documento.create({ data: { id: `${prefix}-classified-doc`, nombre: "contrato.txt", causaId: causa.id, autorId: userA.id, tipo: "otro", confidencial: true, privilegio: true } });
    const classified = await getTool("documento.clasificar").execute({ documentoId: doc.id }, { ...ctx, commandKey: `${prefix}:doc` });
    await prisma.user.update({ where: { id: userA.id }, data: { capabilityRevokes: "doc.confidential.read" } });
    await assert.rejects(() => getTool("documento.clasificar").undo!(classified.undoToken!, ctx), (error: unknown) => (error as { status?: number }).status === 404);
    assert.equal((await prisma.assistantUndo.findUnique({ where: { id: classified.undoToken! } }))?.consumedAt, null);
    await prisma.user.update({ where: { id: userA.id }, data: { capabilityRevokes: "" } });

    // All other mutating tools enter the receipt/audit/undo transaction too.
    const task = await getTool("tarea.crear").execute({ title: "Fixture task", assigneeId: userA.id }, { ...ctx, commandKey: `${prefix}:task` });
    createdIds.push(task.entityId!);
    const completed = await getTool("tarea.completar").execute({ taskId: task.entityId }, { ...ctx, commandKey: `${prefix}:task-done` });
    assert.equal(completed.ok, true);
    const edited = await getTool("nota.editar").execute({ notaId: note.entityId, contenido: "confirmed edit" }, { ...ctx, commandKey: `${prefix}:note-edit` });
    assert.equal(edited.ok, true);
    const plazo = await getTool("plazo.crear").execute({ titulo: "Synthetic plazo", causaId: causa.id, fechaLimite: "2026-12-01" }, { ...ctx, commandKey: `${prefix}:plazo` });
    assert.equal(plazo.ok, true);
    const event = await getTool("evento.crear").execute({ titulo: "Synthetic event", causaId: causa.id, inicio: "2026-12-01T10:00" }, { ...ctx, commandKey: `${prefix}:event` });
    const eventEdit = await getTool("evento.editar").execute({ eventoId: event.entityId, titulo: "Edited event" }, { ...ctx, commandKey: `${prefix}:event-edit` });
    assert.equal(eventEdit.ok, true);
    const eventDelete = await getTool("evento.eliminar").execute({ eventoId: event.entityId }, { ...ctx, commandKey: `${prefix}:event-delete` });
    assert.equal(eventDelete.ok, true);
    const eventDeleteRetry = await getTool("evento.eliminar").execute({ eventoId: event.entityId }, { ...ctx, commandKey: `${prefix}:event-delete` });
    assert.equal(eventDeleteRetry.undoToken, eventDelete.undoToken, "deleted rows replay their committed receipt after a lost response");
    assert.equal(await prisma.auditEvent.count({ where: { actorId: userA.id, action: "evento.delete", entityId: event.entityId } }), 1);
    await prisma.user.update({ where: { id: userA.id }, data: { capabilityRevokes: "evento.manage" } });
    await assert.rejects(() => getTool("evento.eliminar").execute({ eventoId: event.entityId }, { ...ctx, commandKey: `${prefix}:event-delete` }), (error: unknown) => (error as { status?: number }).status === 403);
    await prisma.user.update({ where: { id: userA.id }, data: { capabilityRevokes: "causa.override_walls" } });
    await assert.rejects(() => getTool("evento.eliminar").execute({ eventoId: event.entityId }, { ...ctx, commandKey: `${prefix}:event-delete` }), (error: unknown) => (error as { status?: number }).status === 404, "replay rechecks the deleted event's original matter wall");
    await prisma.user.update({ where: { id: userA.id }, data: { capabilityRevokes: "" } });
    await assert.rejects(() => getTool("evento.eliminar").execute({ eventoId: `${prefix}-different-event` }, { ...ctx, commandKey: `${prefix}:event-delete` }), (error: unknown) => (error as { status?: number }).status === 409, "a deletion receipt still binds the exact original input");
    await assert.rejects(() => getTool("evento.eliminar").execute({ eventoId: event.entityId }, { userId: userB.id, role: "asistente", commandKey: `${prefix}:event-delete` }), (error: unknown) => (error as { status?: number }).status === 404);
    await getTool("evento.eliminar").undo!(eventDelete.undoToken!, ctx);
    assert.equal(await prisma.evento.count({ where: { id: event.entityId! } }), 1);
    const minuta = await getTool("minuta.crear").execute({ causaId: causa.id, titulo: "Fixture minuta", resumenEjecutivo: "fixture" }, { ...ctx, commandKey: `${prefix}:minuta` });
    assert.equal(minuta.ok, true);
    await getTool("minuta.crear").undo!(minuta.undoToken!, ctx);
    assert.equal(await prisma.minuta.count({ where: { id: minuta.entityId! } }), 0);
    const linked = await getTool("causa.vincular").execute({ causaId: causa.id, abogadoId: userC.id }, { ...ctx, commandKey: `${prefix}:link` });
    assert.equal(linked.ok, true);

    const plan = { id: `${prefix}-plan`, intents: [], steps: [], needsConfirm: true };
    await storePlan(plan, userA.id);
    assert.equal((await getPlan(plan.id, userA.id))?.id, plan.id);
    assert.equal(await getPlan(plan.id, userB.id), null);
    assert.equal(await cancelPlan(plan.id, userB.id), false);
    assert.equal(await cancelPlan(plan.id, userA.id), true);
    assert.equal(await getPlan(plan.id, userA.id), null);
    const { executePlanSteps } = await import("./pipeline");
    const deletePartialSteps = [
      { toolId: "evento.eliminar" as const, input: { eventoId: event.entityId }, preview: "delete first" },
      { toolId: "nota.crear" as const, input: { causaId: deleteRecoveryCausaId, titulo: "After committed deletion", contenido: "fixture" }, preview: "later step" },
    ];
    const deletePartial = await executePlanSteps(deletePartialSteps, { ...ctx, commandKey: `${prefix}:delete-partial-plan` });
    assert.deepEqual(deletePartial.map((row) => row.result.ok), [true, false]);
    await prisma.causa.create({ data: { id: deleteRecoveryCausaId, titulo: "Delete recovery fixture", tribunal: "Fixture", materia: "civil", abogadoId: userA.id } });
    const deleteRecovered = await executePlanSteps(deletePartialSteps, { ...ctx, commandKey: `${prefix}:delete-partial-plan` });
    assert.deepEqual(deleteRecovered.map((row) => row.result.ok), [true, true]);
    assert.equal(deleteRecovered[0].result.undoToken, deletePartial[0].result.undoToken);
    assert.equal(await prisma.nota.count({ where: { causaId: deleteRecoveryCausaId, titulo: "After committed deletion" } }), 1);
    await getTool("evento.eliminar").undo!(deleteRecovered[0].result.undoToken!, ctx);
    assert.equal(await prisma.evento.count({ where: { id: event.entityId! } }), 1);
    const partialSteps = [
      { toolId: "nota.crear" as const, input: { causaId: causa.id, titulo: "Partial first", contenido: "fixture" }, preview: "first" },
      { toolId: "nota.crear" as const, input: { causaId: recoveryCausaId, titulo: "Partial second", contenido: "fixture" }, preview: "second" },
    ];
    const partial = await executePlanSteps(partialSteps, { ...ctx, commandKey: `${prefix}:partial-plan` });
    assert.deepEqual(partial.map((row) => row.result.ok), [true, false]);
    await prisma.causa.create({ data: { id: recoveryCausaId, titulo: "Recovered fixture", tribunal: "Fixture", materia: "civil", abogadoId: userA.id } });
    const recovered = await executePlanSteps(partialSteps, { ...ctx, commandKey: `${prefix}:partial-plan` });
    assert.deepEqual(recovered.map((row) => row.result.ok), [true, true]);
    assert.equal(recovered[0].result.entityId, partial[0].result.entityId, "retry resumes from committed receipts");
    assert.equal(await prisma.nota.count({ where: { causaId: causa.id, titulo: "Partial first" } }), 1);

    const { buildAiContextPack, AI_DOCUMENT_CONTEXT_LIMIT } = await import("@/lib/ai/context-pack");
    const now = new Date();
    await prisma.documento.createMany({ data: Array.from({ length: AI_DOCUMENT_CONTEXT_LIMIT + 5 }, (_, index) => ({
      id: `${prefix}-scope-doc-${index}`, causaId: causa.id, nombre: `Fixture ${index}.txt`, ruta: index === 0 ? "old-folder" : "recent-folder",
      extractedMarkdown: `Synthetic evidence ${index}`, extractionStatus: "completed", updatedAt: new Date(now.getTime() - (AI_DOCUMENT_CONTEXT_LIMIT + 5 - index) * 1000),
    })) });
    const actorC = { id: userC.id, role: userC.role };
    const selectedPack = await buildAiContextPack({ causaId: causa.id, user: actorC, role: actorC.role, utility: "doc_qa", prompt: "Synthetic evidence", documentoIds: [`${prefix}-scope-doc-0`, `${prefix}-scope-doc-1`] });
    assert.ok(selectedPack.sources.some((source) => source.id === `${prefix}-scope-doc-0`), "explicit old documents are queried before take limit");
    const folderPack = await buildAiContextPack({ causaId: causa.id, user: actorC, role: actorC.role, utility: "doc_qa", prompt: "Synthetic evidence", rutaPrefix: "old-folder" });
    assert.ok(folderPack.sources.some((source) => source.id === `${prefix}-scope-doc-0`), "old folder is not starved by recent documents");
    const limitedPack = await buildAiContextPack({ causaId: causa.id, user: actorC, role: actorC.role, utility: "doc_qa", prompt: "Synthetic evidence" });
    assert.ok(limitedPack.alerts.some((alert) => alert.includes("Contexto documental parcial")), "large scopes announce incomplete coverage");
    await assert.rejects(() => buildAiContextPack({ causaId: hidden.id, user: actorC, role: actorC.role, utility: "briefing", prompt: "fixture" }), (error: unknown) => (error as { status?: number }).status === 404);
    const secret = await prisma.documento.create({ data: { id: `${prefix}-scoped-secret`, nombre: "privileged.txt", causaId: common.id, autorId: userB.id, privilegio: true, extractedMarkdown: `${prefix} PRIVATE CONTENT`, extractionStatus: "completed" } });
    const secretSite = await prisma.site.create({ data: { name: "Scoped fixture site", slug: `${prefix}-site`, causaId: common.id } });
    await prisma.siteFile.create({ data: { name: "privileged-file.txt", siteId: secretSite.id, privilegio: true, contenido: `${prefix} PRIVATE VDR CONTENT` } });
    const publicPack = await buildAiContextPack({ causaId: common.id, user: actorC, role: actorC.role, utility: "doc_qa", prompt: "fixture" });
    assert.ok(!publicPack.text.includes("PRIVATE CONTENT") && !publicPack.text.includes("PRIVATE VDR CONTENT"), "readable matter does not grant scoped privilege to a nonmember");
    await assert.rejects(() => getTool("documento.resumir").execute({ documentoId: secret.id }, { userId: userC.id, role: "abogado" }), (error: unknown) => (error as { status?: number }).status === 404);
    const { canReadChatSources } = await import("@/lib/ai/chat-access");
    const privateHistory = JSON.stringify([{ role: "assistant", content: "Past sensitive answer", accessRefs: [{ type: "documento", id: secret.id }] }]);
    assert.equal(await canReadChatSources(privateHistory, actorC), false, "saved history cannot replay a now-forbidden source");
    assert.equal(await canReadChatSources(privateHistory, { id: userA.id, role: "socio" }), true);
    assert.equal(await canReadChatSources(JSON.stringify([{ role: "assistant", content: "Legacy unsourced answer" }]), actorC), false, "legacy unverified context fails closed without deleting it");
    assert.equal(await canReadChatSources(JSON.stringify([{ role: "assistant", content: "Verified answer", accessRefs: selectedPack.accessRefs }]), actorC), true);
    const partyName = `${prefix} Adversarial Fixture`;
    await prisma.parte.create({ data: { causaId: hidden.id, nombre: partyName, rol: "demandado", rut: "12345678-5" } });
    const { checkConflicts } = await import("@/lib/conflict");
    const reserved = await checkConflicts({ partes: [{ nombre: partyName, rut: "12345678-5" }], user: actorC });
    assert.equal(reserved.hasRestrictedMatch, true);
    assert.equal(reserved.status, "blocked");
    assert.ok(!reserved.conflicts.some((hit) => hit.causaId === hidden.id));
    assert.ok(!JSON.stringify(reserved).includes(hidden.titulo));
    const allowedConflict = await checkConflicts({ partes: [{ nombre: partyName, rut: "12345678-5" }], user: { id: userA.id, role: "socio" } });
    assert.ok(allowedConflict.conflicts.some((hit) => hit.causaId === hidden.id));
    const conflictDate = new Date("2026-12-01T13:00:00Z");
    await prisma.evento.create({ data: { id: `${prefix}-hidden-event`, causaId: hidden.id, responsableId: userC.id, titulo: "Hidden agenda title", inicio: conflictDate } });
    const { detectEventConflicts } = await import("./conflicts");
    assert.deepEqual(await detectEventConflicts(conflictDate, null, userC.id, undefined, actorC), [], "agenda previews cannot reveal a hidden matter title");
    await prisma.plazo.create({ data: { id: `${prefix}-hidden-deadline`, causaId: hidden.id, responsableId: userC.id, titulo: "Hidden deadline", esFatal: true, fechaLimite: conflictDate } });
    const { buildInicioStatus } = await import("./status");
    const status = await buildInicioStatus(actorC, conflictDate);
    assert.equal(status.eventosHoy, 0);
    assert.equal(status.plazosFatalesProximos, 0);

    const visibleInvoice = await prisma.invoice.create({ data: { number: `${prefix}-visible`, clienteId: cliente.id, causaId: causa.id, status: "emitida", totalClp: 500, paidClp: 100 } });
    const hiddenInvoice = await prisma.invoice.create({ data: { number: `${prefix}-hidden`, clienteId: cliente.id, causaId: hidden.id, status: "emitida", totalClp: 5000, paidClp: 2000 } });
    await prisma.timeEntry.createMany({ data: [
      { userId: userC.id, causaId: causa.id, clienteId: cliente.id, hours: 1, amountClp: 100, description: "visible" },
      { userId: userB.id, causaId: hidden.id, clienteId: cliente.id, hours: 20, amountClp: 2000, description: "hidden" },
    ] });
    await prisma.expense.createMany({ data: [
      { causaId: causa.id, clienteId: cliente.id, amountClp: 40, description: "visible" },
      { causaId: hidden.id, clienteId: cliente.id, amountClp: 3000, description: "hidden" },
    ] });
    await prisma.payment.createMany({ data: [
      { clienteId: cliente.id, invoiceId: visibleInvoice.id, amountClp: 100 },
      { clienteId: cliente.id, invoiceId: hiddenInvoice.id, amountClp: 2000 },
    ] });
    await prisma.ledgerEntry.createMany({ data: [
      { clienteId: cliente.id, causaId: causa.id, tipo: "provision", description: "visible", creditClp: 100, balanceClp: 100 },
      { clienteId: cliente.id, causaId: hidden.id, tipo: "provision", description: "hidden", creditClp: 9900, balanceClp: 10000 },
    ] });
    const { loadBillingOverview } = await import("@/lib/billing-overview");
    const overview = await loadBillingOverview(actorC);
    assert.equal(overview.kpis.unbilledHours, 1);
    assert.equal(overview.kpis.unbilledHonorarios, 100);
    assert.equal(overview.kpis.unbilledGastos, 40);
    assert.equal(overview.kpis.porCobrar, 400);
    assert.equal(overview.kpis.cobradoMes, 100);
    assert.equal(overview.kpis.provisionClp, 100, "global running balance must not leak hidden matter amounts");
    assert.ok(overview.recentInvoices.every((invoice) => invoice.causaId === causa.id));
    const { createPaymentCommand } = await import("@/lib/billing-payments");
    const paymentInput = { clienteId: cliente.id, invoiceId: visibleInvoice.id, amountClp: 50, reference: `${prefix}-payment` };
    const paymentActor = { id: userA.id, role: userA.role };
    failAudit = true;
    await assert.rejects(() => createPaymentCommand(paymentActor, paymentInput, `${prefix}:payment`));
    assert.equal(await prisma.payment.count({ where: { reference: paymentInput.reference } }), 0);
    assert.equal((await prisma.invoice.findUnique({ where: { id: visibleInvoice.id } }))?.paidClp, 100, "payment audit failure rolls back invoice balance");
    assert.equal(await prisma.ledgerEntry.count({ where: { clienteId: cliente.id } }), 2, "payment audit failure rolls back ledger movement");
    failAudit = false;
    const paid = await Promise.all([createPaymentCommand(paymentActor, paymentInput, `${prefix}:payment`), createPaymentCommand(paymentActor, paymentInput, `${prefix}:payment`)]);
    assert.equal(paid[0].id, paid[1].id);
    assert.equal(await prisma.payment.count({ where: { reference: paymentInput.reference } }), 1);
    assert.equal((await prisma.invoice.findUnique({ where: { id: visibleInvoice.id } }))?.paidClp, 150);
    await assert.rejects(() => createPaymentCommand(actorC, { ...paymentInput, invoiceId: hiddenInvoice.id }, `${prefix}:hidden-payment`), (error: unknown) => (error as { status?: number }).status === 404);
    const { createPlazoCommand, updatePlazoCommand } = await import("@/lib/plazo-commands");
    const deadlineBody = { titulo: `${prefix} api deadline`, causaId: causa.id, fechaLimite: "2026-12-15" };
    failAudit = true;
    await assert.rejects(() => createPlazoCommand(paymentActor, deadlineBody, `${prefix}:api-plazo`));
    assert.equal(await prisma.plazo.count({ where: { titulo: deadlineBody.titulo } }), 0);
    failAudit = false;
    const deadlines = await Promise.all([createPlazoCommand(paymentActor, deadlineBody, `${prefix}:api-plazo`), createPlazoCommand(paymentActor, deadlineBody, `${prefix}:api-plazo`)]);
    assert.equal(deadlines[0].id, deadlines[1].id);
    failAudit = true;
    await assert.rejects(() => updatePlazoCommand(paymentActor, { id: deadlines[0].id, estado: "cumplido" }, `${prefix}:api-plazo-close`));
    assert.equal((await prisma.plazo.findUnique({ where: { id: deadlines[0].id } }))?.estado, "pendiente");
    failAudit = false;
    await updatePlazoCommand(paymentActor, { id: deadlines[0].id, estado: "cumplido" }, `${prefix}:api-plazo-close`);
    assert.equal((await prisma.plazo.findUnique({ where: { id: deadlines[0].id } }))?.estado, "cumplido");
    const { createInvoice } = await import("@/lib/billing-invoices");
    const invoiceTime = await prisma.timeEntry.create({ data: { userId: userA.id, causaId: causa.id, clienteId: cliente.id, hours: 1, amountClp: 30, rateClp: 30, description: "Invoice rollback fixture" } });
    const invoiceInput = { clienteId: cliente.id, causaId: causa.id, tipoDocumento: "factura_exenta" as const, status: "emitida" as const, timeEntryIds: [invoiceTime.id], glosa: `${prefix}-invoice-atomic` };
    const ledgerBeforeInvoice = await prisma.ledgerEntry.count({ where: { clienteId: cliente.id } });
    failAudit = true;
    await assert.rejects(() => createInvoice(paymentActor, invoiceInput));
    assert.equal(await prisma.invoice.count({ where: { glosa: invoiceInput.glosa } }), 0, "failed audit rolls back invoice and its lines");
    assert.equal((await prisma.timeEntry.findUnique({ where: { id: invoiceTime.id } }))?.billed, false, "failed audit rolls back billed source hours");
    assert.equal(await prisma.ledgerEntry.count({ where: { clienteId: cliente.id } }), ledgerBeforeInvoice, "failed audit rolls back invoice debit");
    failAudit = false;
    await createInvoice(paymentActor, invoiceInput);
    assert.equal((await prisma.timeEntry.findUnique({ where: { id: invoiceTime.id } }))?.billed, true);
    const beforeConcurrent = await prisma.ledgerEntry.aggregate({ where: { clienteId: cliente.id }, _sum: { creditClp: true, debitClp: true } });
    const prevGlobal = (beforeConcurrent._sum.creditClp || 0) - (beforeConcurrent._sum.debitClp || 0);
    const concurrentInvoiceInput = { clienteId: cliente.id, causaId: causa.id, tipoDocumento: "factura_exenta" as const, status: "emitida" as const, lines: [{ description: "Scoped concurrent invoice", unitAmountClp: 10 }] };
    const concurrentInvoices = await Promise.all([createInvoice(actorC, concurrentInvoiceInput), createInvoice(actorC, concurrentInvoiceInput)]);
    assert.notEqual(concurrentInvoices[0].number, concurrentInvoices[1].number, "concurrent automatic invoice reservations are globally unique");
    const invoiceLedger = await prisma.ledgerEntry.findMany({ where: { invoiceId: { in: concurrentInvoices.map((invoice) => invoice.id) } } });
    assert.deepEqual(invoiceLedger.map((entry) => entry.balanceClp).sort((a, b) => a - b), [prevGlobal - 20, prevGlobal - 10], "stored financial state uses the global aggregate, including inaccessible matters");
    await assert.rejects(() => createInvoice(actorC, { ...concurrentInvoiceInput, number: hiddenInvoice.number }), (error: unknown) => (error as { status?: number; message?: string }).status === 409 && (error as Error).message === "Ya existe una factura con ese número");
    assert.ok(!JSON.stringify(concurrentInvoices).includes(hidden.id), "internal reservation does not return hidden matter metadata");
    console.log("assistant commands integration: rollback/nestedTX/concurrency/idempotency/owner/currentACL/staleUndo/delete replay+partial recovery/11 writes/retrieval/private KPIs/payment+deadline+invoice atomicity/global numbering passed");
  } finally {
    failAudit = false;
    await prisma.assistantUndo.deleteMany({ where: { ownerId: { in: [userA.id, userB.id] } } });
    await prisma.commandExecution.deleteMany({ where: { ownerId: { in: [userA.id, userB.id] } } });
    await prisma.assistantPlanRecord.deleteMany({ where: { ownerId: { in: [userA.id, userB.id] } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: [userA.id, userB.id] } } });
    await prisma.evento.deleteMany({ where: { causaId: { in: [causa.id, hidden.id] } } });
    await prisma.plazo.deleteMany({ where: { causaId: { in: [causa.id, hidden.id] } } });
    await prisma.task.deleteMany({ where: { id: { in: createdIds } } });
    await prisma.payment.deleteMany({ where: { clienteId: cliente.id } });
    await prisma.ledgerEntry.deleteMany({ where: { clienteId: cliente.id } });
    await prisma.invoice.deleteMany({ where: { clienteId: cliente.id } });
    await prisma.timeEntry.deleteMany({ where: { clienteId: cliente.id } });
    await prisma.expense.deleteMany({ where: { clienteId: cliente.id } });
    await prisma.minuta.deleteMany({ where: { causaId: causa.id } });
    await prisma.documento.deleteMany({ where: { causaId: causa.id } });
    await prisma.site.deleteMany({ where: { causaId: common.id } });
    await prisma.documento.deleteMany({ where: { causaId: common.id } });
    await prisma.causa.delete({ where: { id: causa.id } });
    await prisma.causa.delete({ where: { id: hidden.id } });
    await prisma.causa.delete({ where: { id: common.id } });
    await prisma.causa.deleteMany({ where: { id: { in: [recoveryCausaId, deleteRecoveryCausaId] } } });
    await prisma.cliente.delete({ where: { id: cliente.id } });
    await prisma.user.deleteMany({ where: { id: { in: [userA.id, userB.id, userC.id] } } });
    await prisma.$disconnect();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
