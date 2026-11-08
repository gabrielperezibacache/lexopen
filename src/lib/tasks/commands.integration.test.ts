import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { withRejectedAudit } from "@/lib/testing/audit-failure";
import { createTask, createTaskCommand, taskChangesSchema, updateTasks, updateTasksCommand } from "./service";

const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;

async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const tag = randomUUID(), userIds: string[] = [];
  let siteId = "", causaId = "";
  try {
    const makeUser = async () => {
      const row = await prisma.user.create({ data: { name: tag, email: `${randomUUID()}@tasks-fixture.invalid`, role: "abogado", password: "no-login" } });
      userIds.push(row.id); return row;
    };
    const owner = await makeUser(), colleague = await makeUser();
    const cause = await prisma.causa.create({ data: { titulo: tag, tribunal: "Ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); causaId = cause.id;
    const site = await prisma.site.create({ data: { name: tag, slug: tag, causaId } }); siteId = site.id;
    for (const value of ["2030-02-31", "2030-04-31T10:30:00Z", "2030-01-01T24:30:00Z", "invalid"]) {
      assert.equal(taskChangesSchema.safeParse({ dueDate: value }).success, false);
      assert.equal(taskChangesSchema.safeParse({ remindAt: value }).success, false);
    }
    const input = { title: tag, causaId, siteId, dueDate: "2030-02-28", remindAt: "2030-02-27T09:00:00-03:00", assigneeId: owner.id };
    const key = randomUUID(), creations = await Promise.all(Array.from({ length: 3 }, () => createTaskCommand(owner, input, key)));
    const task = creations[0];
    assert.equal(new Set(creations.map(row => row.id)).size, 1);
    assert.equal(new Date(task.dueDate!).toISOString(), "2030-02-28T00:00:00.000Z");
    assert.equal(new Date(task.remindAt!).toISOString(), "2030-02-27T12:00:00.000Z");
    assert.equal(await prisma.taskHistorial.count({ where: { taskId: task.id } }), 1);
    assert.equal(await prisma.auditEvent.count({ where: { action: "task.create", entityId: task.id } }), 1);
    assert.equal(await prisma.notification.count({ where: { entityId: task.id } }), 1);
    await assert.rejects(createTaskCommand(owner, { ...input, title: "Changed" }, key), status(409));

    const child = await createTask(owner, { title: "Child", causaId, parentId: task.id });
    const grandchild = await createTask(owner, { title: "Grandchild", causaId, parentId: child.id });
    await assert.rejects(updateTasks(owner, [task.id], { parentId: grandchild.id, title: "Must roll back" }), status(400));
    await assert.rejects(updateTasks(owner, [task.id], { parentId: task.id }), status(400));
    await assert.rejects(updateTasks(owner, [child.id, grandchild.id], { parentId: grandchild.id }), status(400));
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: task.id } })).title, tag);
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: child.id } })).parentId, task.id);
    await assert.rejects(updateTasks(colleague, [task.id], { title: "Hidden" }), status(404));

    // Supplied role/grants may be stale; current permissions and sessions win.
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "task.assign" } });
    await assert.rejects(createTask(owner, { title: "Forbidden", assigneeId: colleague.id }), status(403));
    await assert.rejects(updateTasks(owner, [task.id], { assigneeId: colleague.id }), status(403));
    const [ownEdit] = await updateTasks(owner, [task.id], { considerations: "Own edits remain available" });
    assert.equal(ownEdit.considerations, "Own edits remain available");
    await prisma.user.update({ where: { id: owner.id }, data: { role: "cliente" } });
    await assert.rejects(createTask(owner, { title: "No longer staff" }), status(403));
    await assert.rejects(updateTasks(owner, [task.id], { status: "done" }), status(403));
    await assert.rejects(createTaskCommand(owner, input, key), status(403));
    await prisma.user.update({ where: { id: owner.id }, data: { role: "abogado", capabilityRevokes: "", sessionVersion: { increment: 1 } } });
    await assert.rejects(createTask(owner, { title: "Stale session" }), status(401));
    const actor = await prisma.user.findUniqueOrThrow({ where: { id: owner.id } });
    await prisma.workflow.create({ data: { name: "Completion fixture", siteId, triggerType: "task_done", stepsJson: JSON.stringify([{ name: "Review", role: "abogado" }]) } });
    const recurring = await createTask(actor, { ...input, title: "Recurring", rrule: "FREQ=WEEKLY;INTERVAL=2" });
    const completion = { status: "done", expectedUpdatedAt: recurring.updatedAt.toISOString() }, completionKey = randomUUID();
    await withRejectedAudit(owner.id, "task.update", async () => {
      await assert.rejects(updateTasksCommand(actor, [recurring.id], completion, completionKey), status(500));
      assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: recurring.id } })).status, "todo");
      assert.equal(await prisma.workflowInstance.count({ where: { workflow: { siteId } } }), 0);
      assert.equal(await prisma.task.count({ where: { title: "Recurring", siteId } }), 1);
    });
    const completed = await updateTasksCommand(actor, [recurring.id], completion, completionKey);
    assert.equal((await updateTasksCommand(actor, [recurring.id], completion, completionKey))[0].id, completed[0].id);
    assert.equal(await prisma.task.count({ where: { title: "Recurring", siteId } }), 2);
    assert.equal(await prisma.workflowInstance.count({ where: { workflow: { siteId } } }), 1);
    assert.equal(await prisma.auditEvent.count({ where: { action: "task.update", entityId: recurring.id } }), 1);
    await assert.rejects(updateTasksCommand(actor, [recurring.id], completion, randomUUID()), status(409));
    const originalTZ = process.env.TZ;
    try {
      for (const timezone of ["America/Santiago", "Asia/Tokyo", "Australia/Sydney"]) {
        process.env.TZ = timezone;
        const seasonal = await createTask(actor, { title: `DST ${timezone}`, causaId, dueDate: "2026-09-06", rrule: "FREQ=WEEKLY" });
        await updateTasks(actor, [seasonal.id], { status: "done" });
        const successor = await prisma.task.findFirstOrThrow({ where: { title: seasonal.title, creatorId: actor.id, id: { not: seasonal.id } } });
        assert.equal(successor.dueDate?.toISOString(), "2026-09-13T00:00:00.000Z");
      }
    } finally {
      if (originalTZ === undefined) delete process.env.TZ;
      else process.env.TZ = originalTZ;
    }
    await prisma.user.update({ where: { id: owner.id }, data: { role: "cliente" } });
    await assert.rejects(updateTasksCommand(actor, [recurring.id], completion, completionKey), status(403));
    console.log("Tareas: fechas estrictas, jerarquías sin ciclos, permisos vigentes, sesión revocada, reintentos concurrentes, efectos únicos y rollback de auditoría comprobados.");
  } finally {
    await prisma.task.deleteMany({ where: { creatorId: { in: userIds } } });
    if (siteId) await prisma.site.delete({ where: { id: siteId } });
    if (causaId) await prisma.causa.delete({ where: { id: causaId } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.commandExecution.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
