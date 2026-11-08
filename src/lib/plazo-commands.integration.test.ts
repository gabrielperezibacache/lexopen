import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { createPlazoCommand, updatePlazoCommand } from "./plazo-commands";
import { createPlazoAlerts } from "./plazo-alerts";
import { civilDateKey } from "./chile-time";
import { assertDisposableDatabaseUrl } from "./testing/disposable-db";

const status = (expected: number) => (error: unknown) => (error as { status?: number }).status === expected;
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const tag = randomUUID(), users: string[] = [];
  let causeId = "";
  try {
    const owner = await prisma.user.create({ data: { name: "Autor ficticio", email: `${tag}@deadline-it.invalid`, role: "abogado", password: "no-login" } }); users.push(owner.id);
    const outside = await prisma.user.create({ data: { name: "Sin acceso", email: `${tag}-outside@deadline-it.invalid`, role: "abogado", password: "no-login" } }); users.push(outside.id);
    const cause = await prisma.causa.create({ data: { titulo: tag, tribunal: "Ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); causeId = cause.id;
    const body = { titulo: "Vencimiento ficticio", causaId: cause.id, fechaLimite: "2088-11-24" };
    for (const bad of [{ fechaLimite: "2088-02-31", diasPlazo: 5 }, { fechaNotificacion: "2088-13-01" }, { diasPlazo: 1e12 }]) {
      await assert.rejects(createPlazoCommand(owner, { ...body, ...bad }, randomUUID()), { name: "ZodError" });
    }
    assert.equal(await prisma.plazo.count({ where: { causaId: cause.id } }), 0);
    const key = randomUUID(), [first, replay] = await Promise.all([createPlazoCommand(owner, body, key), createPlazoCommand(owner, body, key)]);
    assert.equal(first.id, replay.id);
    // Either concurrent caller can replay the JSON receipt, whose dates are ISO strings.
    const cached = await createPlazoCommand(owner, body, key);
    const fechaLimite = new Date(first.fechaLimite);
    for (const result of [first, replay, cached]) {
      assert.equal(result.id, first.id);
      assert.equal(civilDateKey(new Date(result.fechaLimite)), "2088-11-24");
    }
    assert.equal(await prisma.plazo.count({ where: { causaId: cause.id } }), 1);
    for (const capabilityRevokes of ["plazo.close", "plazo.edit"]) {
      await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes } });
      await assert.rejects(updatePlazoCommand(owner, { id: first.id, estado: "cumplido" }, randomUUID()), status(403));
      assert.equal((await prisma.plazo.findUniqueOrThrow({ where: { id: first.id } })).estado, "pendiente");
    }
    await prisma.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });
    // A previously assigned professional has since lost access to the matter.
    await prisma.plazo.update({ where: { id: first.id }, data: { responsableId: outside.id } });
    const alerts = await createPlazoAlerts(prisma, { from: fechaLimite, until: fechaLimite, emailEnabled: true });
    assert.equal(alerts.notifications, 1);
    assert.equal(alerts.emailBuckets.has(outside.email), false);
    assert.equal(await prisma.notification.count({ where: { userId: outside.id } }), 0);
    assert.equal(await prisma.notification.count({ where: { userId: owner.id, entityType: "plazo", entityId: first.id } }), 1);
    const closeKey = randomUUID();
    await updatePlazoCommand(owner, { id: first.id, estado: "cumplido" }, closeKey);
    await updatePlazoCommand(owner, { id: first.id, estado: "cumplido" }, closeKey);
    assert.equal(await prisma.auditEvent.count({ where: { actorId: owner.id, action: "plazo.update" } }), 1);
    await prisma.user.update({ where: { id: outside.id }, data: { role: "cliente" } });
    const orphan = await prisma.plazo.create({ data: { titulo: "Sin causa, cuenta retirada del equipo", fechaLimite, responsableId: outside.id } });
    const blocked = await createPlazoAlerts(prisma, { from: fechaLimite, until: fechaLimite, emailEnabled: true });
    assert.equal(blocked.notifications, 0);
    assert.equal(blocked.emailBuckets.has(outside.email), false);
    assert.equal((await prisma.plazo.findUniqueOrThrow({ where: { id: orphan.id } })).alertaEnviada, false);
    await prisma.plazo.createMany({ data: Array.from({ length: 100 }, () => ({ titulo: "Cuenta retirada", fechaLimite, responsableId: outside.id })) });
    await prisma.plazo.create({ data: { titulo: "Recordatorio válido después de cuentas retiradas", fechaLimite, responsableId: owner.id } });
    assert.equal((await createPlazoAlerts(prisma, { from: fechaLimite, until: fechaLimite, emailEnabled: true })).notifications, 1, "Withdrawn accounts cannot consume the whole reminder batch");
    console.log("Plazos PASS: strict dates, bounded computation, native idempotency, current edit/close permissions and authorized reminders only.");
  } finally {
    await prisma.notification.deleteMany({ where: { userId: { in: users } } });
    await prisma.plazo.deleteMany({ where: { responsableId: { in: users } } });
    if (causeId) await prisma.causa.deleteMany({ where: { id: causeId } });
    await prisma.commandExecution.deleteMany({ where: { ownerId: { in: users } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.$disconnect();
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
