import assert from "node:assert/strict";
import type { Prisma } from "@prisma/client";
import { parseMovimientosFromHtml } from "@/lib/pjud/parse-html";
import { mergePjudMovimientos } from "@/lib/pjud/public-scrape";
import { persistFetchedPjudMovimientos } from "@/lib/pjud/sync";
import { fingerprint, normalizePjudCuaderno, scrapeMovimientoIdentity } from "@/lib/pjud/types";

const date = new Date("2026-10-01T12:00:00Z");
const title = "Resolución de prueba";
const principal = scrapeMovimientoIdentity(title, date, "7", "Principal");
const incidente = scrapeMovimientoIdentity(title, date, "7", "Incidente");
assert.notEqual(principal.externalId, incidente.externalId);
assert.equal(principal.legacyExternalId, `scrape:${fingerprint(title, date, "7")}`);
assert.equal(principal.legacyExternalId, incidente.legacyExternalId);
assert.deepEqual(scrapeMovimientoIdentity(title, date, "7", null), { externalId: principal.legacyExternalId });
assert.equal(normalizePjudCuaderno("  APELACIÓN  Incidental "), "apelacion incidental");
assert.equal(normalizePjudCuaderno("Sin cuaderno"), null);
assert.deepEqual(scrapeMovimientoIdentity(title, date, "7", " PRINCIPAL "), principal);

const parsed = parseMovimientosFromHtml(`<table>
  <tr><th>Folio</th><th>Fecha</th><th>Cuaderno</th><th>Trámite</th><th>Documento</th></tr>
  <tr><td>7</td><td>01/10/2026</td><td>Principal</td><td>${title}</td><td><a href="/principal.pdf">PDF</a></td></tr>
  <tr><td>7</td><td>01/10/2026</td><td>Incidente</td><td>${title}</td><td><a href="/incidente.pdf">PDF</a></td></tr>
</table>`);
assert.equal(parsed.length, 2);
assert.equal(parsed[0].titulo, title, "a cuaderno cell must not become the movement title");
assert.notEqual(parsed[0].externalId, parsed[1].externalId);
assert.equal(parsed[0].legacyExternalId, parsed[1].legacyExternalId);
const merged = mergePjudMovimientos(parsed, [{ ...parsed[0], esReceptor: true }]);
assert.equal(merged.length, 2, "separate cuadernos must survive tab merging");
assert.equal(merged.find((row) => row.cuaderno === "Principal")?.documentoRef, "https://oficinajudicialvirtual.pjud.cl/principal.pdf");
assert.equal(merged.find((row) => row.cuaderno === "Incidente")?.documentoRef, "https://oficinajudicialvirtual.pjud.cl/incidente.pdf");
const unscoped = {
  ...parsed[0], externalId: parsed[0].legacyExternalId!, legacyExternalId: undefined,
  cuaderno: null, esReceptor: true, documentoRef: "https://oficinajudicialvirtual.pjud.cl/ambiguous.pdf",
};
const withoutAmbiguousAlias = mergePjudMovimientos(parsed, [unscoped]);
assert.equal(withoutAmbiguousAlias.length, 2);
assert.ok(withoutAmbiguousAlias.every((movement) => !movement.esReceptor && !movement.documentoRef?.endsWith("ambiguous.pdf")), "an unscoped copy must not transfer flags or PDFs to either cuaderno");

type Stored = { id: string; externalId: string; cuaderno: string | null; documentoRef?: string | null };
function fixture(initial: Stored[]) {
  const rows = initial.map((row) => ({ ...row }));
  const writes: string[] = [];
  const tx = {
    $queryRaw: async () => { writes.push("lock"); return [{ id: "fixture-causa" }]; },
    causaMovimiento: {
      findMany: async ({ where }: { where: { externalId: { in: string[] } } }) => rows.filter((row) => where.externalId.in.includes(row.externalId)),
      update: async ({ where, data }: { where: { id: string }; data: { externalId: string } }) => {
        writes.push("promote");
        assert.deepEqual(Object.keys(data), ["externalId"], "legacy promotion changes no document links or movement fields");
        const row = rows.find((item) => item.id === where.id)!;
        Object.assign(row, data);
        return row;
      },
      createMany: async ({ data }: { data: Array<Omit<Stored, "id">> }) => {
        writes.push("insert");
        const pending = data.filter((row) => !rows.some((existing) => existing.externalId === row.externalId));
        rows.push(...pending.map((row, index) => ({ ...row, id: `new-${rows.length + index}` })));
        return { count: pending.length };
      },
    },
  } as unknown as Pick<Prisma.TransactionClient, "$queryRaw" | "causaMovimiento">;
  return { tx, rows, writes };
}

async function main() {
  const db = fixture([{ id: "preserved-movement", externalId: parsed[0].legacyExternalId!, cuaderno: " PRINCIPAL ", documentoRef: "doc:preserved-document" }]);
  // Reverse order exercises the mismatch before the compatible legacy promotion.
  assert.deepEqual(await persistFetchedPjudMovimientos(db.tx, "fixture-causa", [...parsed].reverse()), { inserted: 1, skipped: 1, newRelevant: [title] });
  assert.equal(db.writes[0], "lock");
  assert.equal(db.rows.length, 2);
  const preserved = db.rows.find((row) => row.id === "preserved-movement")!;
  assert.equal(preserved.externalId, parsed[0].externalId);
  assert.equal(preserved.documentoRef, "doc:preserved-document");
  assert.equal(db.rows.find((row) => row.cuaderno === "Incidente")?.externalId, parsed[1].externalId);
  assert.equal((await persistFetchedPjudMovimientos(db.tx, "fixture-causa", parsed)).inserted, 0, "repeat sync must not duplicate promoted historical rows");
  assert.equal(db.rows.length, 2);

  const unknown = fixture([{ id: "unidentified-old", externalId: parsed[0].legacyExternalId!, cuaderno: null, documentoRef: "doc:keep-old" }]);
  assert.equal((await persistFetchedPjudMovimientos(unknown.tx, "fixture-causa", [parsed[0]])).inserted, 1);
  assert.equal(unknown.rows.find((row) => row.id === "unidentified-old")?.externalId, parsed[0].legacyExternalId, "unknown legacy cuaderno is never guessed or rewritten");
  assert.equal(unknown.rows[0].documentoRef, "doc:keep-old");
  assert.equal(unknown.rows.length, 2);
  const mixed = fixture([]);
  assert.equal((await persistFetchedPjudMovimientos(mixed.tx, "fixture-causa", [...parsed, unscoped])).inserted, 2, "a same-fetch unscoped alias must not reinsert the historical ID");
  assert.equal(mixed.rows.length, 2);
  assert.ok(mixed.rows.every((row) => row.externalId !== unscoped.externalId && !row.documentoRef?.endsWith("ambiguous.pdf")));
  const unidentified = fixture([]);
  assert.equal((await persistFetchedPjudMovimientos(unidentified.tx, "fixture-causa", [unscoped])).inserted, 1);
  assert.equal(unidentified.rows[0].cuaderno, null, "unknown cuaderno must remain unknown rather than become Principal");
  console.log("pjud/movement-identity.test.ts OK (fixtures only)");
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
