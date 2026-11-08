import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { hash } from "bcryptjs";
import { prisma } from "../src/lib/db";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";
import { loginAs, authenticateApiRequests, apiRequest } from "./helpers";
assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
if (process.env.DATABASE_URL !== process.env.E2E_DATABASE_URL) throw Error("Disposable database required");
test("el alta en línea y la sincronización concurrente comparten el control de referencias duplicadas", async ({ page }) => {
  const tag = randomUUID(), a = await prisma.user.create({ data: { name: "Autor nativo ficticio", email: `${tag}@legal-native.invalid`, role: "abogado", password: await hash("lexopen", 10) } });
  try {
    await loginAs(page, a.email); await authenticateApiRequests(page);
    const fields = { titulo: `Alta concurrente ${tag}`, rit: `V-${tag}`, tribunal: "Tribunal de prueba", materia: "civil", partes: [], fechaNotificacion: null };
    const responses = await Promise.all([apiRequest(page).post("/api/causas", { data: fields }), apiRequest(page).post("/api/offline/sync", { data: { kind: "causa", action: "create", requestId: randomUUID(), fields } })]);
    expect(responses.map(r => r.status()).sort()).toEqual(expect.arrayContaining([409])); expect(responses.filter(r => r.ok())).toHaveLength(1);
    const rows = await prisma.causa.findMany({ where: { rit: fields.rit } }); expect(rows).toHaveLength(1);
    expect(await prisma.auditEvent.count({ where: { actorId: a.id, action: "causa.create", entityId: rows[0].id } })).toBe(1);
    expect(await prisma.etapaHistorial.count({ where: { causaId: rows[0].id } })).toBe(1);
    expect(await prisma.causaMiembro.count({ where: { causaId: rows[0].id, userId: a.id } })).toBe(1);
  } finally {
    await prisma.causa.deleteMany({ where: { abogadoId: a.id } }); await prisma.auditEvent.deleteMany({ where: { actorId: a.id } }); await prisma.commandExecution.deleteMany({ where: { ownerId: a.id } }); await prisma.user.delete({ where: { id: a.id } });
  }
});
