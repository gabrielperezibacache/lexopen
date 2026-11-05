/** PostgreSQL export regression. Each record is synthetic and tied to this fixture. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { readBookZip } from "@/lib/books/formats";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { exportPendingTasks } from "./export";
import { readTaskWorkspaceFilters } from "./workspace";

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const db = new PrismaClient({ datasources: { db: { url } } });
  const tag = `task-export-${randomUUID()}`;
  const userIds = [`${tag}-staff`, `${tag}-other`], causeIds = [`${tag}-mine`, `${tag}-foreign`];
  const taskIds = ["ready", "urgent", "done", "cancelled", "hidden", "secret"].map(label => `${tag}-${label}`);
  try {
    const [staff, other] = await Promise.all(userIds.map(id => db.user.create({ data: {
      id, email: `${id}@example.invalid`, name: `Profesional ${id}`, role: "abogado", password: "not-a-login",
      capabilityRevokes: "doc.confidential.read",
    } })));
    const [mine, hidden] = await Promise.all(causeIds.map((id, index) => db.causa.create({ data: {
      id, titulo: index ? "CASO_RESTRINGIDO" : "Causa ficticia autorizada", tribunal: "Tribunal ficticio", materia: "civil",
      acceso: "equipo", abogadoId: index ? other.id : staff.id,
    } })));
    await db.task.createMany({ data: [
      { id: taskIds[0], title: "Revisar resolución ficticia", causaId: mine.id, assigneeId: staff.id, status: "todo", priority: "low",
        description: "Descripción ficticia", instructions: "Instrucción ficticia", considerations: "Consideración ficticia", dueDate: new Date("2099-05-03") },
      { id: taskIds[1], title: "Tarea urgente visible", assigneeId: staff.id, status: "in_progress", priority: "urgent" },
      { id: taskIds[2], title: "TAREA_CERRADA", causaId: mine.id, status: "done", assigneeId: staff.id },
      { id: taskIds[3], title: "TAREA_CANCELADA", causaId: mine.id, status: "cancelled", assigneeId: staff.id },
      { id: taskIds[4], title: "TAREA_RESTRINGIDA", causaId: hidden.id, assigneeId: other.id },
      { id: taskIds[5], title: "MINUTA_CONFIDENCIAL", causaId: mine.id, assigneeId: staff.id },
    ] });
    await db.minuta.create({ data: { causaId: mine.id, titulo: "Minuta ficticia", resumenEjecutivo: "Ficticio", confidencial: true,
      acciones: { create: { taskId: taskIds[5], descripcion: "Ficticio" } },
    } });
    const sheet = async (query: string) => readBookZip(await exportPendingTasks(staff, readTaskWorkspaceFilters(new URLSearchParams(query)), db)).get("xl/worksheets/sheet1.xml")!.toString();
    const standard = await sheet("status=all");
    assert.ok(standard.includes("Tarea urgente visible") && standard.includes("Revisar resolución ficticia"));
    assert.ok(standard.indexOf("Tarea urgente visible") < standard.indexOf("Revisar resolución ficticia"));
    const prioritized = await sheet(`prioritizedCausaId=${mine.id}`);
    assert.ok(prioritized.indexOf("Revisar resolución ficticia") < prioritized.indexOf("Tarea urgente visible"));
    for (const value of ["Causa ficticia autorizada", "Descripción ficticia", "Instrucción ficticia", "Consideración ficticia", staff.name]) assert.ok(standard.includes(value));
    assert.doesNotMatch(standard, /TAREA_CERRADA|TAREA_CANCELADA|TAREA_RESTRINGIDA|CASO_RESTRINGIDO|MINUTA_CONFIDENCIAL/);
    assert.doesNotMatch(await sheet("status=closed"), /Revisar resolución ficticia|TAREA_CERRADA/);
    assert.doesNotMatch(await sheet(`causaId=${hidden.id}`), /TAREA_RESTRINGIDA|CASO_RESTRINGIDO/);
    assert.doesNotMatch(await sheet(`causaId=${mine.id}&status=in_progress`), /Revisar resolución ficticia/);
    assert.doesNotMatch(await sheet("status=todo"), /Tarea urgente visible/);
    console.log("Task export PostgreSQL passed: workspace ordering and filters, open statuses only, matter and minute permissions, and requested fields.");
  } finally {
    await db.causa.deleteMany({ where: { id: { in: causeIds } } });
    await db.task.deleteMany({ where: { id: { in: taskIds } } });
    await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.$disconnect();
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
