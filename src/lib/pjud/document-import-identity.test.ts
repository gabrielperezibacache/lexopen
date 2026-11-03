import assert from "node:assert/strict";
import { prisma } from "@/lib/db";
import { findDocumentImportMovimiento } from "@/lib/pjud/import-causa-documents";
import { listPendingPjudDocumentMovimientos } from "@/lib/pjud/pdf-backup";

const restorers: Array<() => void> = [];
function overrideMethod(target: object, key: string, replacement: unknown) {
  const methods = target as Record<string, unknown>;
  const previous = methods[key];
  methods[key] = replacement;
  restorers.push(() => { methods[key] = previous; });
}
function restoreMethods() { restorers.splice(0).reverse().forEach((restore) => restore()); }

async function main() {
  let rows = [
    { id: "principal-7", folio: "7", cuaderno: "Principal", documentoRef: null, titulo: "Resolución principal" },
    { id: "incidente-7", folio: "7", cuaderno: "Incidente", documentoRef: null, titulo: "Resolución incidental" },
  ];
  let exact: typeof rows[number] | null = null;
  let fallbackQueries = 0;
  overrideMethod(prisma.causaMovimiento, "findFirst", async () => exact);
  overrideMethod(prisma.causaMovimiento, "findMany", async ({ where }: {
    where: { folio: string; cuaderno: { equals: string } };
  }) => {
    fallbackQueries += 1;
    return rows.filter((row) => row.folio === where.folio && row.cuaderno.toLowerCase() === where.cuaderno.equals.toLowerCase());
  });
  try {
    const movement = { externalId: "new-scrape-id", folio: "7", cuaderno: "Incidente" };
    assert.equal((await findDocumentImportMovimiento("fixture-causa", movement))?.id, "incidente-7");
    assert.equal(await findDocumentImportMovimiento("fixture-causa", { ...movement, cuaderno: null }), null);
    assert.equal(await findDocumentImportMovimiento("fixture-causa", { ...movement, cuaderno: "Sin cuaderno" }), null);
    rows = [...rows, { ...rows[1], id: "ambiguous" }];
    assert.equal(await findDocumentImportMovimiento("fixture-causa", movement), null, "ambiguous folio must never choose newest document");

    const queriesBeforeExactMatch = fallbackQueries;
    exact = rows[0];
    assert.equal(await findDocumentImportMovimiento("fixture-causa", movement), null, "colliding legacy ID cannot attach Principal bytes to Incidente");
    exact = { ...rows[1], folio: "8" };
    assert.equal(await findDocumentImportMovimiento("fixture-causa", movement), null, "same external ID with conflicting folio must be rejected");
    exact = { ...rows[1], cuaderno: "  INCIDÉNTE  " };
    assert.equal((await findDocumentImportMovimiento("fixture-causa", movement))?.id, "incidente-7");
    assert.equal(await findDocumentImportMovimiento("fixture-causa", { ...movement, cuaderno: null }), null);
    assert.equal(fallbackQueries, queriesBeforeExactMatch, "external ID identity mismatches must not take a weaker fallback");
  } finally { restoreMethods(); }

  const imported = Array.from({ length: 80 }, (_, i) => ({ id: `imported-${i}`, documentoRef: `doc:${i}` }));
  const unsafe = Array.from({ length: 45 }, (_, i) => ({ id: `unsafe-${i}`, documentoRef: `https://unrelated.example/${i}.pdf` }));
  const pending = Array.from({ length: 3 }, (_, i) => ({ id: `pending-${i}`, documentoRef: `https://oficinajudicialvirtual.pjud.cl/${i}.pdf` }));
  const all = [...imported, ...unsafe, ...pending];
  const queried: unknown[] = [];
  overrideMethod(prisma.causaMovimiento, "findMany", async (query: {
    where: { OR: Array<{ documentoRef: { startsWith: string } }> };
    cursor?: { id: string }; skip?: number; take: number;
  }) => {
    queried.push(query);
    const eligible = all.filter((row) => query.where.OR.some((part) => row.documentoRef.startsWith(part.documentoRef.startsWith)));
    const offset = query.cursor ? eligible.findIndex((row) => row.id === query.cursor!.id) + (query.skip ?? 0) : 0;
    return eligible.slice(offset, offset + query.take);
  });
  try {
    const result = await listPendingPjudDocumentMovimientos("fixture-causa", 2);
    assert.deepEqual(result.map((row) => row.id), ["pending-0", "pending-1"]);
    assert.equal(queried.length, 2, "unsafe URLs must not starve valid older documents");
    all.find((row) => row.id === "pending-0")!.documentoRef = "doc:done-0";
    all.find((row) => row.id === "pending-1")!.documentoRef = "doc:done-1";
    const next = await listPendingPjudDocumentMovimientos("fixture-causa", 2);
    assert.deepEqual(next.map((row) => row.id), ["pending-2"], "later runs must advance beyond already imported documents");
  } finally { restoreMethods(); }
  console.log("pjud/document-import-identity.test.ts OK (fixtures only)");
}

main().catch((error) => { console.error(error); process.exit(1); });
