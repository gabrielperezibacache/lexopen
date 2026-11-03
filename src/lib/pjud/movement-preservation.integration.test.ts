import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "../testing/disposable-db";
import { persistFetchedPjudMovimientos } from "./sync";
import { scrapeMovimientoIdentity, type PjudFetchedMovimiento } from "./types";

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL);
  assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const db = new PrismaClient({ datasources: { db: { url } } });
  let causaId = "";
  try {
    const causa = await db.causa.create({ data: { titulo: `Fictitious OJV preservation ${randomUUID()}`, tribunal: "Tribunal ficticio", materia: "Fixture" } });
    causaId = causa.id;
    const fecha = new Date("2026-11-01T12:00:00.000Z");
    const incoming: PjudFetchedMovimiento[] = ["Principal", "Incidente"].map(cuaderno => ({
      ...scrapeMovimientoIdentity("Resolución de prueba", fecha, "7", cuaderno),
      titulo: "Resolución de prueba", fecha, folio: "7", cuaderno, fuente: "pjud", detalle: "Texto recuperado ficticio",
    }));
    assert.notEqual(incoming[0].externalId, incoming[1].externalId);
    assert.equal(incoming[0].legacyExternalId, incoming[1].legacyExternalId);
    const prior = await db.causaMovimiento.create({ data: {
      causaId, titulo: "Resolución de prueba", fecha, folio: "7", cuaderno: "Principal",
      fuente: "pjud", externalId: incoming[0].legacyExternalId!,
      detalle: "Anotación conservada del profesional", documentoRef: "doc:fictitious-original-preserved",
    } });
    const first = await db.$transaction(tx => persistFetchedPjudMovimientos(tx, causaId, incoming));
    assert.equal(first.inserted, 1);
    const promoted = await db.causaMovimiento.findUniqueOrThrow({ where: { id: prior.id } });
    assert.equal(promoted.externalId, incoming[0].externalId);
    assert.equal(promoted.detalle, prior.detalle);
    assert.equal(promoted.documentoRef, prior.documentoRef);
    assert.equal(promoted.fecha.getTime(), prior.fecha.getTime());
    const concurrent = await Promise.all(Array.from({ length: 3 }, () => db.$transaction(tx => persistFetchedPjudMovimientos(tx, causaId, incoming), { timeout: 15_000 })));
    assert.ok(concurrent.every(result => result.inserted === 0));
    assert.equal(await db.causaMovimiento.count({ where: { causaId } }), 2);
    const rows = await db.causaMovimiento.findMany({ where: { causaId }, orderBy: { cuaderno: "asc" } });
    assert.deepEqual(rows.map(row => row.cuaderno), ["Incidente", "Principal"]);
    assert.ok(rows.some(row => row.id === prior.id));
    console.log("OJV PostgreSQL preservation: historical row, note and document reference retained; separate notebooks and concurrent repeats passed (no OJV/network).");
  } finally {
    if (causaId) { await db.causaMovimiento.deleteMany({ where: { causaId } }); await db.causa.delete({ where: { id: causaId } }); }
    await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
