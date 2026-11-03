import assert from "node:assert/strict";

async function main() {
  const host = globalThis as typeof globalThis & { prisma?: unknown };
  const originalPrisma = host.prisma, originalFetch = globalThis.fetch, env = { ...process.env };
  let reads = 0, writes = 0, calls = 0, revoked = false, hidden = false, transactionConflict = false;
  let rows: { id: string; pjudOrigin: string | null }[] = [], response: unknown = { movimientos: [] }, fetchFails = false;
  let created: Record<string, unknown> | null = null;
  const tx = {
    causa: {
      findMany: async (args: { where: { OR: { rit?: { mode: string }; tribunal: { mode: string } }[] } }) => { reads++; assert.ok(args.where.OR.every(row => row.tribunal.mode === "insensitive")); return rows; },
      findUnique: async () => ({ acceso: hidden ? "equipo" : "estudio", abogadoId: hidden ? "other" : "owner", miembros: [] }),
      create: async ({ data }: { data: Record<string, unknown> }) => { created = data; writes++; return { id: "created-case" }; },
      update: async () => { writes++; return {}; },
    }, auditEvent: { create: async () => ({}) },
  };
  host.prisma = {
    user: { findUniqueOrThrow: async () => ({ id: "owner", role: "abogado", capabilityRevokes: revoked ? "causa.create" : "", capabilityGrants: "" }) },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => { if (transactionConflict) { transactionConflict = false; throw Object.assign(new Error("retry"), { code: "P2034" }); } return callback(tx); },
  };
  process.env.PJUD_SCRAPER_URL = "http://127.0.0.1:8877"; process.env.PJUD_SCRAPER_ALLOW_PRIVATE = "1"; process.env.PJUD_PUBLIC_SCRAPE = "0";
  globalThis.fetch = async input => { calls++; assert.ok(String(input).startsWith("http://127.0.0.1:8877/")); if (fetchFails) throw Error("synthetic credential must not be exposed"); return new Response(JSON.stringify(response)); };
  try {
    const { addCausaByRol, buscarPorRut, lookupIdentity, previewRolLookup } = await import("./lookup");
    assert.deepEqual(lookupIdentity({ rit: " c–123–2026 ", tribunal: " 1º  Juzgado Civil de Santiago " }), { rit: "C-123-2026", tribunal: "1º Juzgado Civil de Santiago" });
    for (const identity of [{ rit: "123", tribunal: "Juzgado Civil" }, { rit: "C-123-2026", tribunal: "Tribunal no identificado" }]) await assert.rejects(async () => lookupIdentity(identity));
    assert.equal(calls, 0);
    await assert.rejects(buscarPorRut("12.345.678-0")); assert.equal(calls, 0);
    response = { causas: [] }; assert.deepEqual(await buscarPorRut("12.345.678-5"), []); assert.equal(calls, 1, "empty sidecar search is not queried again");
    response = { movimientos: [] }; const empty = await previewRolLookup({ rit: "C-123-2026", tribunal: "1º Juzgado Civil de Santiago" });
    assert.equal(empty.count, 0); assert.equal(empty.coverage.complete, false); assert.match(empty.note, /no confirma/); assert.equal(writes, 0);
    response = { movimientos: [{ titulo: "Resolución ficticia", fecha: "2026-11-01", cuaderno: "Incidente" }], identity: { rit: "C-123-2026", tribunal: "1º Juzgado Civil de Santiago" } };
    const found = await previewRolLookup({ rit: "c-123-2026", tribunal: "1º Juzgado Civil de Santiago" });
    assert.equal(found.count, 1); assert.equal(found.sample[0].cuaderno, "Incidente"); assert.equal(found.identity.rit, "C-123-2026"); assert.equal(writes, 0);
    const { scrapeMovimientoIdentity } = await import("./types");
    const { serializeMovimiento } = await import("./scraper-server");
    const { fetchFromScraperSidecar } = await import("./scraper-sidecar");
    const date = new Date("2026-11-01T12:00:00.000Z");
    const source = ["Principal", "Incidente"].map(cuaderno => ({ ...scrapeMovimientoIdentity("Resolución ficticia", date, "7", cuaderno), titulo: "Resolución ficticia", fecha: date, folio: "7", cuaderno }));
    response = { movimientos: source.map(serializeMovimiento) };
    const roundtrip = await fetchFromScraperSidecar({ id: "fixture", rit: "C-123-2026", tribunal: "1º Juzgado Civil de Santiago", ruc: null, titulo: "Fixture", caratula: null });
    assert.deepEqual(roundtrip!.movimientos.map(row => row.externalId), source.map(row => row.externalId));
    assert.deepEqual(roundtrip!.movimientos.map(row => row.legacyExternalId), source.map(row => row.legacyExternalId));
    assert.notEqual(roundtrip!.movimientos[0].externalId, roundtrip!.movimientos[1].externalId);
    for (const invalid of [{}, { movimientos: [], identity: { rit: "C-124-2026", tribunal: "1º Juzgado Civil de Santiago" } }]) {
      response = invalid; await assert.rejects(previewRolLookup({ rit: "C-123-2026", tribunal: "1º Juzgado Civil de Santiago" }), /no pudo responder/);
    }
    fetchFails = true; await assert.rejects(previewRolLookup({ rit: "C-123-2026", tribunal: "1º Juzgado Civil de Santiago" }), error => error instanceof Error && !error.message.includes("credential")); fetchFails = false;
    const aborted = new AbortController(); aborted.abort(); const beforeAbort = calls; await assert.rejects(previewRolLookup({ rit: "C-123-2026", tribunal: "1º Juzgado Civil de Santiago", signal: aborted.signal })); assert.equal(calls, beforeAbort);
    const identity = { rit: "C-123-2026", tribunal: "1º Juzgado Civil de Santiago", actorId: "owner", syncNow: false };
    const saved = await addCausaByRol(identity); assert.equal(saved.created, true); assert.equal((created as Record<string, unknown> | null)?.abogadoId, "owner"); assert.equal((created as Record<string, unknown> | null)?.pjudLastSyncStatus, "never"); assert.equal(saved.sync, null);
    rows = [{ id: "existing", pjudOrigin: "manual" }]; const existing = await addCausaByRol(identity); assert.equal(existing.created, false); assert.equal(existing.causaId, "existing");
    hidden = true; const priorWrites = writes; await assert.rejects(addCausaByRol(identity), error => (error as { status?: number }).status === 404); assert.equal(writes, priorWrites); hidden = false;
    rows.push({ id: "duplicate", pjudOrigin: null }); await assert.rejects(addCausaByRol(identity), /duplicados/); assert.equal(writes, priorWrites);
    rows = []; revoked = true; const priorReads = reads; await assert.rejects(addCausaByRol(identity), /No puede crear/); assert.equal(reads, priorReads); revoked = false;
    transactionConflict = true; assert.equal((await addCausaByRol(identity)).created, true);
  } finally {
    host.prisma = originalPrisma; globalThis.fetch = originalFetch;
    for (const key of Object.keys(process.env)) if (!(key in env)) delete process.env[key]; Object.assign(process.env, env);
  }
  console.log("OJV lookup: read-only, identity, empty/error, abort, permissions, duplicate and registration checks passed (zero network).");
}
main().catch(error => { console.error(error); process.exitCode = 1; });
