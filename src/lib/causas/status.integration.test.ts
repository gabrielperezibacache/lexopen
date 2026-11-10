import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { readCaseStatus } from "./status-service";
import { buildActionContext } from "@/lib/ai/context";
import { addCivilDays, santiagoDateKey } from "@/lib/chile-time";

async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  const tag = randomUUID();
  const owner = await prisma.user.create({ data: { name: "Titular", email: `${tag}-owner@status.invalid`, password: "fixture", role: "abogado" } });
  const other = await prisma.user.create({ data: { name: "Ajeno", email: `${tag}-other@status.invalid`, password: "fixture", role: "asistente" } });
  const causa = await prisma.causa.create({ data: { titulo: "Causa de prueba", tribunal: "Ficticio", materia: "civil", abogadoId: owner.id, acceso: "equipo" } });
  try {
    await assert.rejects(readCaseStatus(causa.id, other), (e: unknown) => (e as { status: number }).status === 404);
    const initial = await readCaseStatus(causa.id, owner);
    await prisma.plazo.createMany({ data: Array.from({ length: 105 }, (_, i) => ({ causaId: causa.id, titulo: `Vencido ${i}`, fechaLimite: new Date("2020-01-01"), estado: "pendiente" })) });
    const next = await prisma.plazo.create({ data: { causaId: causa.id, titulo: "Próximo vencimiento", fechaLimite: new Date(addCivilDays(santiagoDateKey(new Date()), 2)), esFatal: true } });
    await prisma.plazo.create({ data: { causaId: causa.id, titulo: "Ya cumplido", fechaLimite: new Date(), estado: "cumplido" } });
    const writing = await prisma.causaMovimiento.create({ data: { causaId: causa.id, titulo: "Solicitud pendiente", pendienteResolucion: true } });
    await prisma.task.createMany({ data: [
      { causaId: causa.id, title: "Cliente debe aportar respaldo", status: "waiting_client", waitingOn: "cliente", creatorId: owner.id },
      { causaId: causa.id, title: "Tarea terminada", status: "done", creatorId: owner.id },
    ] });
    const changed = await readCaseStatus(causa.id, owner);
    assert.notEqual(initial.fingerprint, changed.fingerprint);
    assert.equal(changed.status.counts.plazos, 106);
    assert.ok(changed.status.deadlines.some(p => p.id === next.id), "Historical overdue records cannot hide upcoming deadlines");
    assert.ok(changed.status.needs.some(n => n.source === `plazo:${next.id}`), "The next deadline must remain actionable despite many overdue records");
    assert.ok(!changed.status.deadlines.some(p => p.title === "Ya cumplido"));
    assert.equal(changed.status.waiting[0].id, writing.id);
    assert.equal(changed.status.waitingTasks[0].title, "Cliente debe aportar respaldo");
    assert.equal(changed.status.taskCount, 1);
    assert.ok(!changed.status.needs.some(n => n.title.includes("Tarea terminada")));
    const context = JSON.parse(await buildActionContext({ action: "causa.estado", causaId: causa.id, user: owner, userRole: owner.role, extra: { forged: "ignored" } }));
    assert.equal(context.caseStatus.fingerprint, changed.fingerprint);
    assert.equal(JSON.stringify(context).includes("forged"), false);
    await prisma.causaMovimiento.update({ where: { id: writing.id }, data: { pendienteResolucion: false } });
    assert.equal((await readCaseStatus(causa.id, owner)).status.waiting.length, 0);
    await prisma.causa.update({ where: { id: causa.id }, data: { abogadoId: other.id } });
    await assert.rejects(readCaseStatus(causa.id, owner), (e: unknown) => (e as { status: number }).status === 404);
    console.log("Case status PG: ethical wall, live revocation, open deadlines, coverage, pending resolutions and server-owned AI context passed; no real model.");
  } finally { await prisma.task.deleteMany({ where: { causaId: causa.id } }); await prisma.causa.delete({ where: { id: causa.id } }); await prisma.user.deleteMany({ where: { id: { in: [owner.id, other.id] } } }); }
}
main().finally(() => prisma.$disconnect()).catch(e => { console.error(e); process.exitCode = 1; });
