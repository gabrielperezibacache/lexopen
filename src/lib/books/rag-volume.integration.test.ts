import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { prisma } from "@/lib/db";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { bookMetadataSchema } from "./ingest";
import { importBook, createBookCollection, updateBookCollection } from "./service";
import { searchBooksWithScope } from "./rag";
async function main() {
  assert.equal(assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL), new URL(process.env.DATABASE_URL!).toString());
  if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw Error("Local fictitious storage only");
  const storage = await mkdtemp(path.join(tmpdir(), "lexopen-rag-volume-")), before = process.env.STORAGE_PATH, users: string[] = [], books: string[] = [];
  process.env.STORAGE_PATH = storage;
  let maxBatch = 0, scans = 0;
  prisma.$use(async (params, next) => { const result = await next(params); if (params.model === "LibraryBookFragment" && params.action === "findMany" && params.args.take === 500) { maxBatch = Math.max(maxBatch, result.length); scans++; } return result; });
  try {
    const owner = await prisma.user.create({ data: { email: `${randomUUID()}@rag-volume.invalid`, name: "Corpus ficticio", role: "abogado", password: "no-login" } }); users.push(owner.id);
    const other = await prisma.user.create({ data: { email: `${randomUUID()}@rag-volume.invalid`, name: "Lector ficticio", role: "abogado", password: "no-login" } }); users.push(other.id);
    const requests = Array.from({ length: 21 }, () => randomUUID()).sort((a, b) => createHash("sha256").update(`${owner.id}:${a}`).digest("hex").localeCompare(createHash("sha256").update(`${owner.id}:${b}`).digest("hex")));
    const filler = "Material enteramente ficticio sobre organización de lecturas y antecedentes. ".repeat(3700);
    for (const [index, requestId] of requests.entries()) {
      const bytes = Buffer.from(index === 20 ? "Litisconsorcio: pasaje ficticio situado al final de la colección ordenada." : filler);
      const imported = await importBook({ ...bookMetadataSchema.parse({ title: `Volumen ficticio ${index + 1}` }), requestId, name: "fixture.txt", bytes, convertToText: true, preserveOriginal: false }, owner);
      books.push(imported.book.id);
    }
    assert.deepEqual([...books].sort(), books);
    let collection = (await createBookCollection({ name: "21 volúmenes ficticios" }, owner)).collection;
    collection = (await updateBookCollection(collection.id, { revision: collection.revision, bookIds: books }, owner)).collection;
    const total = await prisma.libraryBookFragment.count({ where: { bookId: { in: books } } }); assert.ok(total > 3000, String(total));
    const started = performance.now();
    const found = await searchBooksWithScope({ query: "litisconsorcio", bookIds: [], collectionIds: [collection.id] }, owner);
    assert.equal(found.scope.bookIds.length, 21); assert.equal(found.result.coverage.fragmentsConsidered, total); assert.equal(found.result.coverage.corpusLimited, false);
    assert.equal(found.result.results[0]?.bookId, books[20]); assert.match(found.result.results[0].quote, /Litisconsorcio/);
    assert.ok(maxBatch <= 500 && scans >= 14);
    await assert.rejects(searchBooksWithScope({ query: "litisconsorcio", collectionIds: [collection.id] }, other), (error: unknown) => (error as { status?: number }).status === 404);
    collection = (await updateBookCollection(collection.id, { revision: collection.revision, memberIds: [other.id] }, owner)).collection;
    assert.equal((await searchBooksWithScope({ query: "litisconsorcio", collectionIds: [collection.id] }, other)).result.results[0]?.bookId, books[20]);
    await updateBookCollection(collection.id, { revision: collection.revision, memberIds: [] }, owner);
    await assert.rejects(searchBooksWithScope({ query: "litisconsorcio", collectionIds: [collection.id] }, other));
    console.log(`RAG volume passed: ${total} genuine fragments, 21 books, final-volume match, full coverage, batches <=${maxBatch}, current shared ACL; ${Math.round(performance.now() - started)} ms including access checks on this local fixture.`);
  } finally {
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: users } } }); await prisma.user.deleteMany({ where: { id: { in: users } } }); await prisma.$disconnect();
    await rm(storage, { recursive: true, force: true }); if (before === undefined) delete process.env.STORAGE_PATH; else process.env.STORAGE_PATH = before;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
