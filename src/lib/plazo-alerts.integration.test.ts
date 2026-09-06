import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { createPlazoAlerts, escapeAlertHtml } from "./plazo-alerts";
import { writeAuditStrict } from "./audit";

const url = new URL(process.env.E2E_DATABASE_URL || "http://invalid");
assert.ok(["postgres:", "postgresql:"].includes(url.protocol));
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname));
assert.match(url.pathname, /e2e|test/i, "Use a disposable local test database");
const db = new PrismaClient({ datasources: { db: { url: url.toString() } } });
const suffix = randomUUID();
const date = new Date(2087, 2, 10, 12);
const opts = { from: date, until: date, emailEnabled: true };

async function main() {
  const user = await db.user.create({ data: {
    email: `audit-${suffix}@example.invalid`, name: "Auditoría <prueba>",
    password: "original-test-password", role: "abogado",
  } });
  const causa = await db.causa.create({ data: {
    titulo: `Auditoría ${suffix}`, tribunal: "Tribunal de prueba", materia: "civil", abogadoId: user.id,
  } });
  const plazos = await db.plazo.createManyAndReturn({ data: Array.from({ length: 3 }, (_, i) => ({
    titulo: `Plazo ${suffix}-${i}`, fechaLimite: date, responsableId: user.id, causaId: causa.id,
  })) });
  try {
    const broken = db.$extends({ query: { plazo: {
      async updateMany() { throw new Error("simulated-marker-failure"); },
    } } });
    await assert.rejects(createPlazoAlerts(broken as unknown as PrismaClient, opts), /simulated-marker-failure/);
    assert.equal(await db.notification.count({ where: { userId: user.id } }), 0,
      "Notifications must roll back if marking deadlines fails");
    assert.equal(await db.plazo.count({ where: { id: { in: plazos.map(p => p.id) }, alertaEnviada: true } }), 0);

    const results = await Promise.all([createPlazoAlerts(db, opts), createPlazoAlerts(db, opts)]);
    assert.equal(results.reduce((total, r) => total + r.notifications, 0), 3);
    assert.equal(await db.notification.count({ where: { userId: user.id } }), 3,
      "Overlapping runs and duplicate recipient roles must not duplicate notifications");
    assert.equal((await createPlazoAlerts(db, opts)).notifications, 0);
    assert.equal(results.reduce((total, r) => total + (r.emailBuckets.get(user.email)?.lines.length || 0), 0), 3);

    await assert.rejects(db.$transaction(async tx => {
      await tx.user.update({ where: { id: user.id }, data: { password: "changed-test-password" } });
      await writeAuditStrict({ actorId: `missing-${suffix}`, action: "audit.test", entityType: "User" }, tx);
    }));
    assert.equal((await db.user.findUniqueOrThrow({ where: { id: user.id } })).password, "original-test-password");
    assert.equal(escapeAlertHtml('<a href="x">&'), "&lt;a href=&quot;x&quot;&gt;&amp;");
    console.log("plazo-alerts.integration.test.ts OK (rollback, concurrent delivery, audit atomicity)");
  } finally {
    await db.notification.deleteMany({ where: { userId: user.id } });
    await db.plazo.deleteMany({ where: { id: { in: plazos.map(p => p.id) } } });
    await db.causa.delete({ where: { id: causa.id } });
    await db.user.delete({ where: { id: user.id } });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => db.$disconnect());
