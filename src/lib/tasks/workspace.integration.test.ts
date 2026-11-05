import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { updateTasks } from "./service";
import { taskWorkspaceWhere, workspaceTaskCausa, workspaceTaskSelect } from "./workspace";

async function main() {
  const isolated = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(new URL(process.env.DATABASE_URL || "").toString(), isolated);
  const tag = randomUUID();
  const rollback = Symbol("fixture complete");
  try {
    await prisma.$transaction(async tx => {
      const makeUser = (name: string) => tx.user.create({ data: { name, role: "abogado", email: `${name}.${tag}@example.invalid`, password: "fixture" } });
      const owner = await makeUser("responsable");
      const colleague = await makeUser("colega");
      const cause = await tx.causa.create({ data: { titulo: `Expediente ${tag}`, tribunal: "Órgano ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id } });
      const old = await tx.task.create({ data: { title: "Tarea antigua sin enlace directo", creatorId: owner.id } });
      const minute = await tx.minuta.create({ data: { titulo: "Acta ficticia", resumenEjecutivo: "Trabajo reservado", causaId: cause.id } });
      await tx.minutaAccion.create({ data: { descripcion: "Preparar prueba", minutaId: minute.id, taskId: old.id } });
      const filters = { causaId: cause.id, status: "pending" };
      const rows = await tx.task.findMany({ where: taskWorkspaceWhere(owner, filters), select: workspaceTaskSelect });
      assert.equal(rows.length, 1);
      assert.equal(workspaceTaskCausa(rows[0])?.id, cause.id);
      assert.equal(await tx.task.count({ where: { AND: [{ id: old.id }, taskWorkspaceWhere(colleague, {})] } }), 0);
      await assert.rejects(updateTasks(owner, [old.id], { assigneeId: colleague.id }, undefined, tx), { status: 403 });
      await tx.causaMiembro.create({ data: { causaId: cause.id, userId: colleague.id, rol: "colaborador" } });
      const [assigned] = await updateTasks(owner, [old.id], { assigneeId: colleague.id, instructions: "Contrastar el original", considerations: "Reservado al equipo" }, undefined, tx);
      assert.equal(assigned.assigneeId, colleague.id);
      assert.equal(assigned.instructions, "Contrastar el original");
      assert.equal(assigned.considerations, "Reservado al equipo");
      await assert.rejects(updateTasks(owner, [old.id], { priority: "urgent", expectedUpdatedAt: "2026-01-01T00:00:00.000Z" }, undefined, tx), { status: 409 });
      assert.equal(await tx.task.count({ where: { AND: [{ id: old.id }, taskWorkspaceWhere(colleague, filters)] } }), 1);

      const deadlines = [
        ["anterior", "2026-11-04T22:00:00.000Z"], ["hoy fecha", "2026-11-05T00:00:00.000Z"],
        ["hoy noche", "2026-11-06T01:00:00.000Z"], ["mañana fecha", "2026-11-06T00:00:00.000Z"],
      ];
      await tx.task.createMany({ data: deadlines.map(([title, dueDate]) => ({ title, dueDate: new Date(dueDate), causaId: cause.id })) });
      const now = new Date("2026-11-05T17:00:00.000Z");
      const titles = async (bucket: string) => (await tx.task.findMany({ where: taskWorkspaceWhere(owner, { ...filters, bucket }, now), select: { title: true }, orderBy: { title: "asc" } })).map(task => task.title);
      assert.deepEqual(await titles("hoy"), ["hoy fecha", "hoy noche"]);
      assert.deepEqual(await titles("vencidas"), ["anterior"]);
      assert.deepEqual(await titles("semana"), ["hoy fecha", "hoy noche", "mañana fecha"]);
      throw rollback;
    }, { timeout: 20_000 });
    assert.fail("Test transaction should roll back");
  } catch (error) {
    if (error !== rollback) throw error;
  } finally {
    await prisma.$disconnect();
  }
  console.log("Tareas: acceso a la causa de la minuta, asignación y ventanas civiles comprobadas.");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
