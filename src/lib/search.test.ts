import assert from "node:assert/strict";
import { Prisma } from "@prisma/client";
import { ftsCausaIds, ftsDocumentoIds, ftsWikiIds } from "./search";

async function main() {
  for (const search of [ftsCausaIds, ftsDocumentoIds, ftsWikiIds]) {
    const statements: Prisma.Sql[] = [];
    const rows = Array.from({ length: 235 }, (_, index) => ({ id: `candidate-${String(index).padStart(3, "0")}` }));
    const client = {
      async $queryRaw<T>(query: TemplateStringsArray | Prisma.Sql): Promise<T> {
        assert.ok("sql" in query);
        statements.push(query as Prisma.Sql);
        const offset = (statements.length - 1) * 100;
        return rows.slice(offset, offset + 100) as T;
      },
    };
    const checked: string[][] = [];
    const visible = rows.slice(220).map(row => row.id);
    const ids = await search(client, "fundamentación", async candidates => {
      checked.push(candidates);
      // Deliberately reverse the policy query's order and add a foreign ID.
      return [...candidates.filter(id => visible.includes(id)).reverse().map(id => ({ id })), { id: "not-a-candidate" }];
    }, 10);
    assert.deepEqual(ids, visible.slice(0, 10), "More than two full excluded batches must not displace visible matches");
    assert.equal(checked.length, 3);
    assert.ok(checked.every(batch => batch.length <= 100), "No unbounded ID collection is sent to the policy query");
    assert.ok(statements[1].values.includes(rows[99].id), "Continuation uses the preceding candidate ID");
    assert.ok(statements[2].values.includes(rows[199].id));
    assert.ok(statements.every(statement => statement.sql.includes("ORDER BY id ASC")));

    const unavailable = { async $queryRaw<T>(): Promise<T> { throw new Error("unaccent unavailable"); } };
    assert.equal(await search(unavailable, "query", async () => { throw new Error("Must not authorize absent FTS candidates"); }), null);
    const forbidden = new Error("Policy unavailable");
    await assert.rejects(search({ async $queryRaw<T>(): Promise<T> { return [{ id: "candidate" }] as T; } }, "query", async () => { throw forbidden; }), error => error === forbidden);
    assert.deepEqual(await search(unavailable, " ", async () => []), []);
    assert.deepEqual(await search(unavailable, "query", async () => [], 0), []);
    await assert.rejects(search(unavailable, "query", async () => [], 101), RangeError);

    let calls = 0;
    assert.deepEqual(await search({ async $queryRaw<T>(): Promise<T> { calls++; return [] as T; } }, "query", async () => []), []);
    assert.equal(calls, 1, "Exhausted queries stop without a speculative extra page");
  }
  console.log("search.test.ts OK: authorized limit, stable batches, query fallback and fail-closed policy errors");
}

main().catch(error => { console.error(error); process.exitCode = 1; });
