import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { withRejectedAudit } from "@/lib/testing/audit-failure";
import { createNativeMinute, getMinuteView, nativeMinuteCreateSchema, updateNativeMinute } from "./http-service";

const status = (expected: number) => (error: unknown) => (error as { status?: number }).status === expected;

async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const tag = randomUUID();
  let ownerId = "", causeId = "", siteId = "";
  try {
    const owner = await prisma.user.create({ data: { name: `Autor ${tag}`, email: `${tag}@minute-effects.invalid`, role: "abogado", password: "no-login" } });
    ownerId = owner.id;
    const cause = await prisma.causa.create({ data: { titulo: `Causa ${tag}`, tribunal: "Ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id } });
    causeId = cause.id;
    const site = await prisma.site.create({ data: { name: `Espacio ${tag}`, slug: tag, causaId: cause.id } });
    siteId = site.id;
    const workflow = await prisma.workflow.create({ data: { name: "Seguimiento terminado", siteId, active: true, triggerType: "task_done", stepsJson: "[]" } });
    const body = nativeMinuteCreateSchema.parse({ causaId: causeId, titulo: "Minuta de prueba", resumenEjecutivo: "Resumen ficticio", acciones: [{ descripcion: "Revisar antecedentes", responsable: owner.name, fechaLimite: "2026-11-24", crearTask: true, crearPlazo: true }] });
    const createKey = randomUUID();
    const [first, replay] = await Promise.all([createNativeMinute(owner, body, createKey), createNativeMinute(owner, body, createKey)]);
    assert.equal(first.id, replay.id);
    assert.equal(await prisma.minuta.count({ where: { causaId: causeId } }), 1);
    assert.equal(await prisma.task.count({ where: { causaId: causeId } }), 1);
    assert.equal(await prisma.plazo.count({ where: { causaId: causeId } }), 1);
    const action = first.acciones[0];
    await prisma.task.update({ where: { id: action.taskId! }, data: { rrule: "FREQ=DAILY" } });
    const current = await getMinuteView(owner, first.id);
    const original = await prisma.documento.findUniqueOrThrow({ where: { id: first.documentoId! } });
    const complete = { action: "accion-estado", accionId: action.id, estado: "hecha", expectedVersion: current.version };
    const completeKey = randomUUID();
    await Promise.all([updateNativeMinute(owner, first.id, complete, completeKey), updateNativeMinute(owner, first.id, complete, completeKey)]);
    assert.equal(await prisma.workflowInstance.count({ where: { workflowId: workflow.id } }), 1, "Completion from a minute must run the same workflow once");
    const tasks = await prisma.task.findMany({ where: { causaId: causeId } });
    assert.equal(tasks.length, 2, "A recurring follow-up creates exactly one successor");
    const done = tasks.find(task => task.id === action.taskId)!;
    assert.equal(done.status, "done");
    assert.ok(done.completedAt);
    assert.equal(done.completedById, owner.id);
    const successor = tasks.find(task => task.id !== action.taskId)!;
    assert.equal(successor.status, "todo");
    assert.equal(successor.assigneeId, owner.id);
    assert.equal(successor.siteId, siteId);
    assert.equal(successor.dueDate!.getTime() - done.dueDate!.getTime(), 86400_000);
    assert.equal((await prisma.plazo.findUniqueOrThrow({ where: { id: action.plazoId! } })).estado, "cumplido");
    const exported = await prisma.documento.findUniqueOrThrow({ where: { id: first.documentoId! } });
    assert.match(exported.contenido!, /estado Hecha/);
    assert.equal(exported.version, original.version + 1);
    await assert.rejects(updateNativeMinute(owner, first.id, { ...complete, estado: "pendiente" }, randomUUID()), status(409));

    const completed = await getMinuteView(owner, first.id);
    const reopen = { ...complete, expectedVersion: completed.version, estado: "pendiente" };
    await withRejectedAudit(owner.id, "minuta.update", async () => {
      await assert.rejects(updateNativeMinute(owner, first.id, reopen, randomUUID()), status(500));
      assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: action.taskId! } })).status, "done");
      assert.equal((await prisma.documento.findUniqueOrThrow({ where: { id: exported.id } })).version, exported.version);
    });
    await updateNativeMinute(owner, first.id, reopen, randomUUID());
    const reopenedTask = await prisma.task.findUniqueOrThrow({ where: { id: action.taskId! } });
    assert.equal(reopenedTask.status, "todo");
    assert.equal(reopenedTask.completedAt, null);
    assert.equal((await prisma.plazo.findUniqueOrThrow({ where: { id: action.plazoId! } })).estado, "pendiente");
    assert.match((await prisma.documento.findUniqueOrThrow({ where: { id: exported.id } })).contenido!, /estado Pendiente/);
    await updateNativeMinute(owner, first.id, complete, completeKey);
    assert.equal(await prisma.workflowInstance.count({ where: { workflowId: workflow.id } }), 1, "Replaying an earlier completion cannot repeat its effects after reopening");
    assert.equal(await prisma.task.count({ where: { causaId: causeId } }), 2);
    const reopened = await getMinuteView(owner, first.id);
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "plazo.close" } });
    await assert.rejects(updateNativeMinute(owner, first.id, { ...complete, expectedVersion: reopened.version }, randomUUID()), status(403));
    assert.equal(await prisma.workflowInstance.count({ where: { workflowId: workflow.id } }), 1);
    console.log("Minutas integration PASS: native idempotency, version conflicts, current permissions, coherent document/task/deadline state, one completion workflow and recurring successor, reopening, replay and atomic rollback.");
  } finally {
    if (siteId) { await prisma.workflowInstance.deleteMany({ where: { workflow: { siteId } } }); await prisma.workflow.deleteMany({ where: { siteId } }); }
    if (ownerId) await prisma.task.deleteMany({ where: { creatorId: ownerId } });
    if (siteId) await prisma.site.deleteMany({ where: { id: siteId } });
    if (causeId) await prisma.causa.deleteMany({ where: { id: causeId } });
    if (ownerId) {
      await prisma.mensajeSaliente.deleteMany({ where: { userId: ownerId } });
      await prisma.notification.deleteMany({ where: { userId: ownerId } });
      await prisma.commandExecution.deleteMany({ where: { ownerId } });
      await prisma.auditEvent.deleteMany({ where: { actorId: ownerId } });
      await prisma.user.deleteMany({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
