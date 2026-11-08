import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { withRejectedAudit } from "@/lib/testing/audit-failure";
import { createWorkflowCommand, startWorkflowCommand, advanceWorkflowCommand, workflowCommandSchema } from "./commands";

const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;

async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const tag = randomUUID(), userIds: string[] = [];
  let caseId = "", siteId = "";
  try {
    async function user() {
      const row = await prisma.user.create({ data: { name: tag, email: `${randomUUID()}@workflow-fixture.invalid`, role: "abogado", password: "no-login" } });
      userIds.push(row.id); return row;
    }
    const owner = await user(), reader = await user(), outsider = await user();
    const cause = await prisma.causa.create({ data: { titulo: tag, tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: owner.id, miembros: { create: { userId: reader.id, rol: "lectura" } } } }); caseId = cause.id;
    const site = await prisma.site.create({ data: { name: tag, slug: tag, causaId: caseId } }); siteId = site.id;
    const create = { action: "create", name: tag, siteId, steps: [{ name: "First", role: "abogado" }, { name: "Second", role: "abogado" }] };
    await assert.rejects(createWorkflowCommand(reader, create, randomUUID()), status(403));
    await assert.rejects(createWorkflowCommand(outsider, create, randomUUID()), status(404));
    const createKey = randomUUID(), workflow = await createWorkflowCommand(owner, create, createKey);
    assert.equal((await createWorkflowCommand(owner, create, createKey)).id, workflow.id);
    const input = { action: "start", workflowId: workflow.id, payload: { title: tag } };
    await assert.rejects(startWorkflowCommand(reader, input, randomUUID()), status(403));
    await assert.rejects(startWorkflowCommand(outsider, input, randomUUID()), status(404));
    await prisma.workflow.update({ where: { id: workflow.id }, data: { active: false } });
    await assert.rejects(startWorkflowCommand(owner, input, randomUUID()), status(409));
    assert.equal(await prisma.workflowInstance.count({ where: { workflowId: workflow.id } }), 0);
    await prisma.workflow.update({ where: { id: workflow.id }, data: { active: true } });

    const startKey = randomUUID();
    const starts = await Promise.all(Array.from({ length: 3 }, () => startWorkflowCommand(owner, input, startKey)));
    const instance = starts[0];
    assert.equal(new Set(starts.map(row => row.id)).size, 1);
    assert.equal(await prisma.workflowInstance.count({ where: { workflowId: workflow.id } }), 1);
    assert.equal(await prisma.auditEvent.count({ where: { action: "workflow.start", entityId: instance.id } }), 1);
    await assert.rejects(startWorkflowCommand(owner, { ...input, payload: { title: "Changed" } }, startKey), status(409));

    const advance = { action: "advance", instanceId: instance.id, expectedStep: 0, decision: "approve" };
    assert.equal(workflowCommandSchema.safeParse({ action: "advance", instanceId: instance.id, decision: "approve" }).success, false);
    await assert.rejects(advanceWorkflowCommand(owner, { action: "advance", instanceId: instance.id, decision: "approve" }, randomUUID()));
    assert.equal((await prisma.workflowInstance.findUniqueOrThrow({ where: { id: instance.id } })).currentStep, 0);
    await assert.rejects(advanceWorkflowCommand(reader, advance, randomUUID()), status(403));
    const advanceKeys = [randomUUID(), randomUUID()];
    const attempts = await Promise.allSettled(advanceKeys.map(key => advanceWorkflowCommand(owner, advance, key)));
    assert.equal(attempts.filter(row => row.status === "fulfilled").length, 1);
    const loser = attempts.find(row => row.status === "rejected"); assert.ok(loser?.status === "rejected" && status(409)(loser.reason));
    const winnerKey = advanceKeys[attempts.findIndex(row => row.status === "fulfilled")];
    assert.equal((await advanceWorkflowCommand(owner, advance, winnerKey)).currentStep, 1);
    assert.equal((await prisma.workflowInstance.findUniqueOrThrow({ where: { id: instance.id } })).currentStep, 1);
    assert.equal(await prisma.auditEvent.count({ where: { action: "workflow.advance", entityId: instance.id } }), 1);

    // Each decision is bound to the displayed step, including rejection.
    await assert.rejects(advanceWorkflowCommand(owner, { ...advance, decision: "reject" }, randomUUID()), status(409));
    const finish = { ...advance, expectedStep: 1 }, finishKey = randomUUID();
    assert.equal((await advanceWorkflowCommand(owner, finish, finishKey)).status, "approved");
    assert.equal((await advanceWorkflowCommand(owner, finish, finishKey)).status, "approved");
    await assert.rejects(advanceWorkflowCommand(owner, finish, randomUUID()), status(409));

    const rollbackKey = randomUUID(), beforeInstances = await prisma.workflowInstance.count({ where: { workflowId: workflow.id } });
    await withRejectedAudit(owner.id, "workflow.start", async () => {
      await assert.rejects(startWorkflowCommand(owner, input, rollbackKey), status(500));
      assert.equal(await prisma.workflowInstance.count({ where: { workflowId: workflow.id } }), beforeInstances);
    });
    const recovered = await startWorkflowCommand(owner, input, rollbackKey);
    assert.equal((await startWorkflowCommand(owner, input, rollbackKey)).id, recovered.id);
    const nextInput = { ...advance, instanceId: recovered.id }, nextKey = randomUUID();
    await withRejectedAudit(owner.id, "workflow.advance", async () => {
      await assert.rejects(advanceWorkflowCommand(owner, nextInput, nextKey), status(500));
      const row = await prisma.workflowInstance.findUniqueOrThrow({ where: { id: recovered.id } });
      assert.equal(row.status, "pending"); assert.equal(row.currentStep, 0);
    });
    await advanceWorkflowCommand(owner, nextInput, nextKey);
    const rejected = await advanceWorkflowCommand(owner, { ...nextInput, expectedStep: 1, decision: "reject" }, randomUUID());
    assert.equal(rejected.status, "rejected");
    await assert.rejects(advanceWorkflowCommand(owner, { ...nextInput, expectedStep: 1 }, randomUUID()), status(409));

    const roleWorkflow = await createWorkflowCommand(owner, { ...create, steps: [{ name: "Admin only", role: "admin" }] }, randomUUID());
    const roleInstance = await startWorkflowCommand(owner, { ...input, workflowId: roleWorkflow.id }, randomUUID());
    await assert.rejects(advanceWorkflowCommand(owner, { ...advance, instanceId: roleInstance.id }, randomUUID()), status(403));
    await prisma.workflow.update({ where: { id: roleWorkflow.id }, data: { stepsJson: "[]" } });
    await assert.rejects(startWorkflowCommand(owner, { ...input, workflowId: roleWorkflow.id }, randomUUID()), status(400));
    const createRollbackKey = randomUUID();
    const beforeWorkflows = await prisma.workflow.count({ where: { siteId } });
    await withRejectedAudit(owner.id, "workflow.create", async () => {
      await assert.rejects(createWorkflowCommand(owner, create, createRollbackKey), status(500));
      assert.equal(await prisma.workflow.count({ where: { siteId } }), beforeWorkflows);
    });
    await createWorkflowCommand(owner, create, createRollbackKey);
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "causa.write" } });
    await assert.rejects(startWorkflowCommand(owner, input, startKey), status(403));
    await assert.rejects(advanceWorkflowCommand(owner, advance, winnerKey), status(403));
    assert.equal(await prisma.workflowInstance.count({ where: { workflowId: workflow.id } }), 2);
    console.log("Workflows passed: current permissions and roles, inactive/invalid definitions, concurrent starts, required step, stale decisions, approval/rejection, receipt replay and create/start/advance audit rollback.");
  } finally {
    if (siteId) await prisma.site.delete({ where: { id: siteId } });
    if (caseId) await prisma.causa.delete({ where: { id: caseId } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
    await prisma.commandExecution.deleteMany({ where: { ownerId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
