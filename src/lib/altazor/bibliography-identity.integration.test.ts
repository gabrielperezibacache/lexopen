import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { importBibliographyEntries } from "./bibliography-service";
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  let userId = "";
  try {
    const user = await prisma.user.create({ data: { email: `${randomUUID()}@bibliography.invalid`, name: "Ficticio", role: "abogado", password: "no-login" } }); userId = user.id;
    const entry = { title: "Libro ficticio para deduplicación", authors: [{ family: "Pérez", given: "Ana" }], year: 2026, type: "book", isbn: "0-306-40615-2", publisher: "Ficticia" };
    const imported = await importBibliographyEntries({ requestId: randomUUID(), format: "json", content: JSON.stringify([entry]) }, user);
    const otherFormat = await importBibliographyEntries({ requestId: randomUUID(), format: "ris", content: "TY  - BOOK\nTI  - Libro ficticio para deduplicación\nAU  - Pérez, Ana\nPY  - 2026\nSN  - 9780306406157\nPB  - Ficticia\nER  - \n" }, user);
    assert.deepEqual(otherFormat.ids, imported.ids); assert.equal(otherFormat.reused, 1);
    const noId = { ...entry, isbn: undefined, title: "LIBRO FICTICIO PARA DEDUPLICACION", authors: [{ name: "Ana Pérez" }] };
    const fallback = await importBibliographyEntries({ requestId: randomUUID(), format: "json", content: JSON.stringify([noId]) }, user);
    assert.deepEqual(fallback.ids, imported.ids); assert.equal(fallback.added, 0);
    const distinct = await importBibliographyEntries({ requestId: randomUUID(), format: "json", content: JSON.stringify([{ ...entry, isbn: "9780131103627" }]) }, user);
    assert.equal(distinct.added, 1);
    const original = await prisma.altazorBibliographyEntry.findUniqueOrThrow({ where: { id: imported.ids[0] } });
    assert.equal(JSON.parse(original.metadataJson).title, entry.title, "duplicates cannot replace registered metadata");
    const ambiguous = await importBibliographyEntries({ requestId: randomUUID(), format: "json", content: JSON.stringify([{ ...noId, publisher: "" }]) }, user);
    assert.equal(ambiguous.added, 1, "incomplete metadata cannot choose between two ISBN editions");
    assert.equal(await prisma.altazorBibliographyEntry.count({ where: { ownerId: user.id } }), 3);
    console.log("Bibliography PostgreSQL passed: cross-format ISBN identity, title/author fallback, conflicting editions retained and registered metadata preserved.");
  } finally { if (userId) await prisma.user.delete({ where: { id: userId } }); await prisma.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
