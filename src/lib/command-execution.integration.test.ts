import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { serializable } from "./command-execution";
import { createEventCommand } from "./calendario/commands";
import { assertDisposableDatabaseUrl } from "./testing/disposable-db";
import { withRejectedAudit } from "./testing/audit-failure";

function fulfilled<T>(results: PromiseSettledResult<T>[]): T[] {
  const failures = results.filter(result => result.status === "rejected");
  if (failures.length) throw new AggregateError(failures.map(result => result.reason), "Concurrent commands failed after all writers settled");
  return results.map(result => (result as PromiseFulfilledResult<T>).value);
}
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const tag = randomUUID();
  let ownerId = "", causeId = "";
  try {
    const owner = await prisma.user.create({ data: { email: `${tag}@command-contention.invalid`, name: "base", password: "no-login", role: "abogado" } });
    ownerId = owner.id;
    // Both transactions read the same row version before either writes it.
    // PostgreSQL must abort one and the fresh callback must retain both edits.
    let readers = 0, executions = 0, release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    let rejectBarrier!: (error: Error) => void;
    const expired = new Promise<never>((_, reject) => { rejectBarrier = reject; });
    const barrierTimeout = setTimeout(() => rejectBarrier(new Error("Concurrent fixture did not reach its read barrier")), 10_000);
    try {
      const update = (suffix: string) => {
        let first = true;
        return serializable(async tx => {
          executions++;
          const row = await tx.user.findUniqueOrThrow({ where: { id: owner.id }, select: { name: true } });
          if (first) {
            first = false;
            if (++readers === 2) release();
            await Promise.race([ready, expired]);
          }
          await tx.user.update({ where: { id: owner.id }, data: { name: row.name + suffix } });
        });
      };
      fulfilled(await Promise.allSettled([update("A"), update("B")]));
    } finally { clearTimeout(barrierTimeout); }
    assert.ok(executions >= 3, "A real serialization conflict must execute a fresh callback");
    assert.match((await prisma.user.findUniqueOrThrow({ where: { id: owner.id } })).name, /^base(?:AB|BA)$/);

    causeId = (await prisma.causa.create({ data: { titulo: `Contention ${tag}`, tribunal: "Ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id } })).id;
    const input = { titulo: "Reunión concurrente ficticia", inicio: "2092-11-24T10:00:00Z", fin: "2092-11-24T11:00:00Z", causaId: causeId };
    await withRejectedAudit(owner.id, "evento.create", async () => {
      await assert.rejects(createEventCommand(owner, input, randomUUID()), (error: unknown) => (error as { status?: number }).status === 500);
      assert.equal(await prisma.evento.count({ where: { causaId: causeId } }), 0);
      assert.equal(await prisma.commandExecution.count({ where: { ownerId: owner.id } }), 0);
    });
    const key = randomUUID();
    const events = fulfilled(await Promise.allSettled(Array.from({ length: 8 }, () => createEventCommand(owner, input, key))));
    assert.equal(new Set(events.map(event => event.id)).size, 1);
    assert.equal(await prisma.evento.count({ where: { causaId: causeId } }), 1);
    assert.equal(await prisma.commandExecution.count({ where: { ownerId: owner.id } }), 1);
    assert.equal(await prisma.auditEvent.count({ where: { actorId: owner.id, action: "evento.create" } }), 1);
    await assert.rejects(createEventCommand(owner, { ...input, titulo: "Otro contenido" }, key), (error: unknown) => (error as { status?: number }).status === 409);
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "evento.manage" } });
    await assert.rejects(createEventCommand(owner, input, key), (error: unknown) => (error as { status?: number }).status === 403);
    assert.equal(await prisma.evento.count({ where: { causaId: causeId } }), 1);
    console.log("Commands PostgreSQL PASS: forced serialization rollback retains both edits; eight duplicate event requests commit one event, receipt and audit; audit failure rolls back and replay rechecks input and current permissions.");
  } finally {
    if (ownerId) {
      await prisma.evento.deleteMany({ where: { responsableId: ownerId } });
      if (causeId) await prisma.causa.deleteMany({ where: { id: causeId } });
      await prisma.commandExecution.deleteMany({ where: { ownerId } });
      await prisma.auditEvent.deleteMany({ where: { actorId: ownerId } });
      await prisma.user.deleteMany({ where: { id: ownerId } });
    }
    await prisma.$disconnect();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
