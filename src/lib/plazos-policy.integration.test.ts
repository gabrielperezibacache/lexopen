import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "./db";
import { assertDisposableDatabaseUrl } from "./testing/disposable-db";
import { createPlazoCommand } from "./plazo-commands";
import { plazoCreateSchema } from "./schemas";
import { normalizeAssistantInput } from "./assistant/normalize";
import { requireDeadlineComputation } from "./plazos-policy";
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  assert.equal(await prisma.organization.count(), 0, "fresh disposable country scope");
  const tag = randomUUID(); let userId = "", orgId = "";
  try {
    const user = await prisma.user.create({ data: { email: `${tag}@deadline.invalid`, name: "Ficticio", role: "abogado", password: "no-login" } }); userId = user.id;
    const input = plazoCreateSchema.parse({ titulo: tag, diasPlazo: 5, fechaNotificacion: "2026-11-09" });
    const blocked = (error: unknown) => (error as { status?: number }).status === 422;
    await assert.rejects(createPlazoCommand(user, input, randomUUID()), blocked);
    const org = await prisma.organization.create({ data: { name: tag, settings: { create: { workCountry: "AR" } } } }); orgId = org.id;
    await assert.rejects(createPlazoCommand(user, input, randomUUID()), blocked);
    await assert.rejects(requireDeadlineComputation(), blocked);
    const manual = await createPlazoCommand(user, { ...input, fechaLimite: "2026-12-01" }, randomUUID());
    assert.equal(manual.calculationCountry, null);
    await prisma.firmSettings.update({ where: { organizationId: orgId }, data: { workCountry: "CL" } });
    const calculated = await createPlazoCommand(user, input, randomUUID());
    assert.equal(calculated.calculationCountry, "CL"); assert.equal(calculated.calculationRegime, "internal_weekdays_cl_v1");
    assert.equal(await prisma.plazo.count({ where: { responsableId: userId } }), 2);
    const now = new Date("2026-11-09T15:00:00Z");
    assert.equal(normalizeAssistantInput("crea un plazo en 5 días hábiles", now, "AR").dates.length, 0);
    assert.ok(normalizeAssistantInput("crea un plazo en 5 días hábiles", now, "CL").dates.length);
    console.log("Deadline country policy passed: no implicit Chile engine for unset/foreign country, manual dates preserved, explicit CL regime provenance and no hidden assistant calculation.");
  } finally {
    await prisma.plazo.deleteMany({ where: { responsableId: userId } }); await prisma.commandExecution.deleteMany({ where: { ownerId: userId } }); await prisma.auditEvent.deleteMany({ where: { actorId: userId } });
    if (orgId) await prisma.organization.delete({ where: { id: orgId } }); if (userId) await prisma.user.delete({ where: { id: userId } }); await prisma.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
