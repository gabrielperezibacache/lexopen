import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { withRejectedAudit } from "@/lib/testing/audit-failure";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { detectEventConflicts } from "@/lib/assistant/conflicts";
import { createEventCommand, updateEventCommand, deleteEventCommand } from "./commands";
import { buildIcs } from "./ics";

const status = (expected: number) => (error: unknown) => (error as { status?: number }).status === expected;
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const tag = randomUUID(), users: string[] = [];
  let causeId = "";
  try {
    const owner = await prisma.user.create({ data: { email: `${tag}@agenda-it.invalid`, name: "Agenda ficticia", role: "abogado", password: "no-login" } }); users.push(owner.id);
    const outside = await prisma.user.create({ data: { email: `${tag}-outside@agenda-it.invalid`, name: "Sin acceso", role: "abogado", password: "no-login" } }); users.push(outside.id);
    const cause = await prisma.causa.create({ data: { titulo: tag, tribunal: "Ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); causeId = cause.id;
    const input = { titulo: "Reunión ficticia", inicio: "2092-11-24T10:00:00Z", fin: "2092-11-24T12:00:00Z", causaId: cause.id };
    await assert.rejects(createEventCommand(owner, { ...input, inicio: "2092-02-31T10:00Z" }, randomUUID()), { name: "ZodError" });
    await assert.rejects(createEventCommand(owner, { ...input, fin: "2092-11-24T09:00:00Z" }, randomUUID()), status(422));
    await assert.rejects(createEventCommand(owner, { ...input, responsableId: outside.id }, randomUUID()), status(403));
    await withRejectedAudit(owner.id, "evento.create", async () => {
      await assert.rejects(createEventCommand(owner, input, randomUUID()), status(500));
      assert.equal(await prisma.evento.count({ where: { causaId: cause.id } }), 0);
      assert.equal(await prisma.activity.count({ where: { causaId: cause.id } }), 0);
    });
    const key = randomUUID(), [first, replay] = await Promise.all([createEventCommand(owner, input, key), createEventCommand(owner, input, key)]);
    assert.equal(first.id, replay.id);
    assert.equal(await prisma.evento.count({ where: { causaId: cause.id } }), 1);
    const neighbor = await prisma.evento.create({ data: { titulo: "Conflicto real", inicio: new Date("2092-11-24T11:00:00Z"), fin: new Date("2092-11-24T13:00:00Z"), causaId: cause.id, responsableId: owner.id } });
    await prisma.evento.createMany({ data: Array.from({ length: 201 }, (_, index) => ({ titulo: "Evento anterior", inicio: new Date(Date.UTC(2091, 0, 1 + index, 10)), fin: new Date(Date.UTC(2091, 0, 1 + index, 11)), causaId: cause.id, responsableId: owner.id })) });
    assert.deepEqual((await detectEventConflicts(first.inicio, first.fin, owner.id, first.id, owner)).map(event => event.id), [neighbor.id], "Old events must not consume the conflict candidate limit");
    const move = { inicio: "2092-11-26T10:00:00Z", expectedUpdatedAt: first.updatedAt.toISOString() }, moveKey = randomUUID();
    const moved = await updateEventCommand(owner, first.id, move, moveKey);
    assert.equal(moved.fin?.toISOString(), "2092-11-26T12:00:00.000Z");
    assert.equal((await updateEventCommand(owner, first.id, move, moveKey)).id, first.id);
    await assert.rejects(updateEventCommand(owner, first.id, { titulo: "No sobrescribir", expectedUpdatedAt: first.updatedAt.toISOString() }, randomUUID()), status(409));
    await assert.rejects(updateEventCommand(owner, first.id, { fin: "2092-11-25T12:00:00Z" }, randomUUID()), status(422));
    await withRejectedAudit(owner.id, "evento.update", async () => {
      await assert.rejects(updateEventCommand(owner, first.id, { titulo: "No guardar" }, randomUUID()), status(500));
      assert.equal((await prisma.evento.findUniqueOrThrow({ where: { id: first.id } })).titulo, input.titulo);
    });
    const allDay = await createEventCommand(owner, { titulo: "Día completo", inicio: "2092-11-24", todoElDia: true, causaId: cause.id }, randomUUID());
    assert.equal(allDay.inicio.toISOString(), "2092-11-24T00:00:00.000Z");
    assert.equal(allDay.fin?.toISOString(), "2092-11-25T00:00:00.000Z");
    assert.match(buildIcs([allDay]), /DTEND;VALUE=DATE:20921125/);
    const movedAllDay = await updateEventCommand(owner, allDay.id, { inicio: "2092-11-26" }, randomUUID());
    assert.equal(movedAllDay.fin?.toISOString(), "2092-11-27T00:00:00.000Z");
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "evento.manage" } });
    await assert.rejects(updateEventCommand(owner, first.id, { estado: "realizado" }, randomUUID()), status(403));
    await assert.rejects(createEventCommand(owner, input, key), status(403));
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });
    await withRejectedAudit(owner.id, "evento.delete", async () => {
      await assert.rejects(deleteEventCommand(owner, first.id, randomUUID()), status(500));
      assert.ok(await prisma.evento.findUnique({ where: { id: first.id } }));
    });
    const deleteKey = randomUUID();
    await deleteEventCommand(owner, first.id, deleteKey);
    await deleteEventCommand(owner, first.id, deleteKey);
    assert.equal(await prisma.auditEvent.count({ where: { actorId: owner.id, action: "evento.delete" } }), 1);
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityGrants: "evento.manage" } });
    await prisma.causaMiembro.create({ data: { causaId: cause.id, userId: outside.id, rol: "colaborador" } });
    const assigned = await createEventCommand(owner, { ...input, responsableId: outside.id }, randomUUID());
    await prisma.user.update({ where: { id: outside.id }, data: { role: "cliente" } });
    await updateEventCommand(owner, assigned.id, { responsableId: owner.id }, randomUUID());
    assert.equal((await prisma.evento.findUniqueOrThrow({ where: { id: assigned.id } })).responsableId, owner.id, "An authorized manager can repair an assignment to someone who left the team");
    const orphan = await prisma.evento.create({ data: { titulo: "Evento anterior de una cuenta retirada", inicio: first.inicio, causaId: cause.id, responsableId: outside.id } });
    await deleteEventCommand(owner, orphan.id, randomUUID());
    assert.equal(await prisma.evento.findUnique({ where: { id: orphan.id } }), null);
    console.log("Agenda PASS: strict intervals, all-day dates and ICS, duration-preserving moves, conflict candidate bounds, current permissions, version conflicts, idempotent create/update/delete and atomic audit rollback.");
  } finally {
    await prisma.evento.deleteMany({ where: { responsableId: { in: users } } });
    if (causeId) await prisma.causa.deleteMany({ where: { id: causeId } });
    await prisma.commandExecution.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
