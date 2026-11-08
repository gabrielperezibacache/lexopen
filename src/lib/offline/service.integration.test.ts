import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { withRejectedAudit } from "@/lib/testing/audit-failure";
import { serializable } from "@/lib/command-execution";
import { updateClienteRecord } from "@/lib/clientes/mutations";
import { createTask } from "@/lib/tasks/service";
import { readOfflineEntity, syncOfflineEntity } from "./service";
const status = (n: number) => (error: unknown) => (error as { status?: number }).status === n;
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const tag = randomUUID(), users: string[] = [], clients: string[] = []; let causaId = "", siteId = "";
  try {
    const a = await prisma.user.create({ data: { name: "Offline fixture", email: `${tag}@offline-records.invalid`, role: "abogado", password: "no-login" } }); users.push(a.id);
    const b = await prisma.user.create({ data: { name: "Other fixture", email: `${tag}-b@offline-records.invalid`, role: "abogado", password: "no-login" } }); users.push(b.id);
    const create = { kind: "cliente", action: "create", requestId: randomUUID(), fields: { razonSocial: `Cliente privado ${tag}`, telefono: "+15555550100", notas: "Private contact fixture" } };
    await withRejectedAudit(a.id, "cliente.create", async () => {
      await assert.rejects(syncOfflineEntity(a, create), status(500));
      assert.equal(await prisma.cliente.count({ where: { razonSocial: create.fields.razonSocial } }), 0);
      assert.equal(await prisma.commandExecution.count({ where: { ownerId: a.id } }), 0);
    });
    const pair = await Promise.all([syncOfflineEntity(a, create), syncOfflineEntity(a, create)]); const id = pair[0].receipt.entityId; clients.push(id);
    assert.equal(pair[1].receipt.entityId, id); assert.equal(await prisma.cliente.count({ where: { razonSocial: create.fields.razonSocial } }), 1);
    assert.equal(await prisma.auditEvent.count({ where: { actorId: a.id, action: "cliente.create", entityId: id } }), 1);
    const receipts = await prisma.commandExecution.findMany({ where: { ownerId: a.id } });
    assert.equal(receipts.length, 1); assert.doesNotMatch(receipts[0].resultJson!, /Private contact|15555550100|razonSocial|fields/);
    await assert.rejects(syncOfflineEntity(a, { ...create, fields: { ...create.fields, razonSocial: "Otro cliente" } }), status(409));
    let snapshot = await readOfflineEntity(a, "cliente", id); assert.equal(snapshot.kind, "cliente");
    await serializable(tx => updateClienteRecord(a, id, { telefono: "+15555550102" }, tx));
    await assert.rejects(syncOfflineEntity(a, { kind: "cliente", action: "update", requestId: randomUUID(), entityId: id, expectedVersion: snapshot.version, fields: { razonSocial: "No sobrescribir" } }), status(409));
    snapshot = await readOfflineEntity(a, "cliente", id);
    const update = { kind: "cliente", action: "update", requestId: randomUUID(), entityId: id, expectedVersion: snapshot.version, fields: { razonSocial: create.fields.razonSocial, notas: "Cambio local confirmado" } };
    await withRejectedAudit(a.id, "cliente.update", async () => {
      await assert.rejects(syncOfflineEntity(a, update), status(500));
      assert.equal((await prisma.cliente.findUniqueOrThrow({ where: { id } })).notas, create.fields.notas);
    });
    const ack = await syncOfflineEntity(a, update); assert.notEqual(ack.receipt.version, snapshot.version);
    await assert.rejects(serializable(tx => updateClienteRecord(a, id, { notas: "Formulario en línea obsoleto" }, tx, snapshot.version)), status(409));
    await serializable(tx => updateClienteRecord(a, id, { notas: "Versión posterior del servidor" }, tx));
    const replay = await syncOfflineEntity(a, update); assert.equal(replay.receipt.version, ack.receipt.version); assert.notEqual(replay.entity.version, replay.receipt.version);
    assert.equal((await prisma.cliente.findUniqueOrThrow({ where: { id } })).notas, "Versión posterior del servidor");
    const current = await readOfflineEntity(a, "cliente", id);
    const competing = await Promise.allSettled(["Uno", "Dos"].map(notas => syncOfflineEntity(a, { ...update, requestId: randomUUID(), expectedVersion: current.version, fields: { razonSocial: create.fields.razonSocial, notas } })));
    assert.equal(competing.filter(item => item.status === "fulfilled").length, 1); assert.equal(competing.filter(item => item.status === "rejected" && status(409)(item.reason)).length, 1);
    await prisma.user.update({ where: { id: a.id }, data: { role: "cliente" } }); await assert.rejects(syncOfflineEntity(a, create), status(403));
    await prisma.user.update({ where: { id: a.id }, data: { role: "abogado", sessionVersion: { increment: 1 } } });
    await assert.rejects(syncOfflineEntity({ id: a.id, sessionVersion: a.sessionVersion }, create), status(401));
    a.sessionVersion += 1;
    const taskCreate = { kind: "task", action: "create", requestId: randomUUID(), fields: { title: `Tarea personal ${tag}`, description: "Texto personal" } };
    await withRejectedAudit(a.id, "task.create", async () => {
      await assert.rejects(syncOfflineEntity(a, taskCreate), status(500));
      assert.equal(await prisma.task.count({ where: { title: taskCreate.fields.title } }), 0);
    });
    const [t1, t2] = await Promise.all([syncOfflineEntity(a, taskCreate), syncOfflineEntity(a, taskCreate)]);
    assert.equal(t1.receipt.entityId, t2.receipt.entityId);
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: t1.receipt.entityId } })).assigneeId, a.id);
    assert.equal(await prisma.taskHistorial.count({ where: { taskId: t1.receipt.entityId, campo: "creada" } }), 1);
    await assert.rejects(syncOfflineEntity(a, { ...taskCreate, requestId: randomUUID(), fields: { title: "No asignar a otro", assigneeId: b.id } }), { name: "ZodError" });
    const cause = await prisma.causa.create({ data: { titulo: tag, tribunal: "Ficticio", materia: "civil", acceso: "equipo", abogadoId: a.id } }); causaId = cause.id;
    const site = await prisma.site.create({ data: { name: tag, slug: randomUUID(), causaId } }); siteId = site.id;
    const flow = await prisma.workflow.create({ data: { name: tag, siteId, active: true, triggerType: "task_done", stepsJson: "[]" } });
    const recurring = await createTask(a, { title: `Recurrente ${tag}`, assigneeId: a.id, causaId, siteId, dueDate: "2026-11-12T13:40:10.000Z", rrule: "FREQ=DAILY" });
    const prepared = await readOfflineEntity(a, "task", recurring.id);
    const complete = { kind: "task", action: "update", requestId: randomUUID(), entityId: recurring.id, expectedVersion: prepared.version, fields: { title: recurring.title, status: "done" } };
    await withRejectedAudit(a.id, "task.update", async () => {
      await assert.rejects(syncOfflineEntity(a, complete), status(500)); assert.equal(await prisma.workflowInstance.count({ where: { workflowId: flow.id } }), 0);
    });
    await Promise.all([syncOfflineEntity(a, complete), syncOfflineEntity(a, complete)]);
    assert.equal(await prisma.task.count({ where: { title: recurring.title } }), 2, "one recurring successor");
    assert.equal(await prisma.workflowInstance.count({ where: { workflowId: flow.id } }), 1, "one completion trigger");
    assert.equal(await prisma.taskHistorial.count({ where: { taskId: recurring.id, campo: "estado" } }), 1);
    await assert.rejects(readOfflineEntity(b, "task", recurring.id), status(404));
    await prisma.causa.update({ where: { id: causaId }, data: { abogadoId: b.id } });
    await assert.rejects(syncOfflineEntity(a, complete), status(404));
    const deleted = await syncOfflineEntity(a, { ...create, requestId: randomUUID(), fields: { razonSocial: `Deleted ${tag}` } });
    await prisma.cliente.delete({ where: { id: deleted.receipt.entityId } });
    await assert.rejects(syncOfflineEntity(a, { ...create, requestId: randomUUID(), action: "update", entityId: deleted.receipt.entityId, expectedVersion: deleted.receipt.version }), status(404));
    console.log("Offline records PostgreSQL passed: atomic encrypted-vault transport receipts without contact text, concurrent create/update, replay fingerprints, original-version conflict, online form CAS, audit rollback, fresh role/session/case ACL and exactly one recurring task/history/workflow effect.");
  } finally {
    await prisma.task.deleteMany({ where: { creatorId: { in: users } } });
    if (siteId) { await prisma.workflowInstance.deleteMany({ where: { workflow: { siteId } } }); await prisma.workflow.deleteMany({ where: { siteId } }); await prisma.site.deleteMany({ where: { id: siteId } }); }
    if (causaId) await prisma.causa.deleteMany({ where: { id: causaId } });
    await prisma.cliente.deleteMany({ where: { id: { in: clients } } });
    await prisma.mensajeSaliente.deleteMany({ where: { userId: { in: users } } }); await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } }); await prisma.commandExecution.deleteMany({ where: { ownerId: { in: users } } }); await prisma.user.deleteMany({ where: { id: { in: users } } }); await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
