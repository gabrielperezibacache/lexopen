import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { sha256 } from "@/lib/evidence/fragments";
import { bookMetadataSchema } from "./ingest";
import { judicialMetadataSchema } from "./judicial";
import { importBook, readBook, readBookOriginal, readBookPage, readBookText, listBooks, resolveBookCitation, updateBook, createBookCollection, updateBookCollection } from "./service";
import { searchBooks } from "./rag";
import { createBookDraft, readBookDraft, exportBookDraft } from "./drafts";

const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(url, process.env.DATABASE_URL);
  if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw Error("Requires local fixture storage");
  const root = await mkdtemp(path.join(tmpdir(), "lexopen-judicial-library-test-")), previousStorage = process.env.STORAGE_PATH; process.env.STORAGE_PATH = root;
  const db = new PrismaClient({ datasources: { db: { url } } }), userIds: string[] = [], fetchBefore = globalThis.fetch; let networkCalls = 0;
  globalThis.fetch = (async () => { networkCalls++; throw Error("Judicial source metadata must never fetch a URL"); }) as typeof fetch;
  try {
    const users = [];
    for (const role of ["abogado", "abogado", "admin"]) { const user = await db.user.create({ data: { email: `${randomUUID()}@judicial-fixture.invalid`, name: `Judicial fixture ${role}`, password: "not-a-real-login", role } }); userIds.push(user.id); users.push(user); }
    const [owner, reader, outsider] = users;
    const metadata = bookMetadataSchema.parse({ title: "Fuente enteramente ficticia de prueba", author: "Autora ficticia", edition: "2ª", publisher: "Editorial ficticia", year: "2025" });
    const bytes = Buffer.from("La prueba del pago exige antecedentes comprobables.\n\nLos hechos descritos son ficticios y sólo prueban la aplicación.");
    const legacy = await importBook({ ...metadata, requestId: randomUUID(), name: "fuente-ficticia.txt", bytes }, owner, db);
    assert.equal(legacy.book.sourceType, "book"); assert.equal(legacy.book.judicial, null);
    const detail = await readBook(legacy.book.id, owner, {}, db), fragment = detail.fragments[0];
    const input = { bookId: legacy.book.id, fragmentId: fragment.id, quote: "La prueba del pago exige antecedentes comprobables." };
    const originalCitation = await resolveBookCitation(input, owner, { client: db });
    const legacyIdentity = sha256(JSON.stringify([legacy.book.id, fragment.id, sha256(input.quote), originalCitation.textSha256, sha256(bytes), null]));
    assert.equal(originalCitation.sourceKey, legacyIdentity);
    const draft = await createBookDraft({ requestId: randomUUID(), title: "Borrador de prueba judicial", query: "prueba pago", instruction: "Revisar los pasajes elegidos", bookIds: [legacy.book.id], mode: "extractive" }, owner, db); assert.ok(draft.draft);
    // Simulate a previously saved citation that predates judicial metadata fields.
    await db.libraryWritingDraft.update({ where: { id: draft.draft.id }, data: { citationsJson: JSON.stringify(draft.draft.citations.map(({ sourceType: _sourceType, judicial: _judicial, ...citation }) => { void _sourceType; void _judicial; return citation; })) } });
    assert.equal((await readBookDraft(draft.draft.id, owner, db)).citations[0].sourceType, "book");
    const judicial = judicialMetadataSchema.parse({ court: "Tribunal enteramente ficticio", chamber: "Sala de prueba", caseNumber: "123-2026", decisionDate: "2024-02-29", caseTitle: "Parte ficticia A con B", matter: "Prueba", officialUrl: "https://judicial-fixture.invalid/123" });
    await assert.rejects(updateBook(legacy.book.id, { revision: 1, sourceType: "judgment" }, owner, db));
    const classified = await updateBook(legacy.book.id, { revision: 1, sourceType: "judgment", judicial }, owner, db);
    assert.equal(classified.book.sourceType, "judgment"); assert.equal(classified.book.judicial?.decisionDate, "2024-02-29");
    assert.deepEqual((await readBookOriginal(legacy.book.id, owner, db)).bytes, bytes);
    const classifiedCitation = await resolveBookCitation(input, owner, { client: db }); assert.equal(classifiedCitation.sourceKey, legacyIdentity); assert.deepEqual(classifiedCitation.judicial, judicial);
    const rehydrated = await readBookDraft(draft.draft.id, owner, db); assert.equal(rehydrated.citations[0].sourceType, "judgment"); assert.match(rehydrated.body, /Tribunal enteramente ficticio\. Sala de prueba\. Sentencia\. Rol 123-2026\. 29\/02\/2024/); assert.doesNotMatch(rehydrated.body, /Autora ficticia|Editorial ficticia/); assert.ok(rehydrated.warnings.some(warning => /autenticidad, firmeza ni ejecutoria/.test(warning)));
    const changed = await updateBook(legacy.book.id, { revision: classified.book.revision, judicial: { caseNumber: "999-2026", chamber: "Sala revisada", decisionDate: "2026-03-01" } }, owner, db);
    const fresh = await resolveBookCitation(input, owner, { client: db }); assert.equal(fresh.sourceKey, legacyIdentity); assert.equal(fresh.judicial?.court, judicial.court); assert.equal(fresh.judicial?.caseNumber, "999-2026");
    for (const format of ["md", "txt"] as const) { const exported = await exportBookDraft(draft.draft.id, format, owner, db); assert.match(exported.content, /Rol 999-2026\. 01\/03\/2026/); assert.match(exported.content, /Sala revisada/); assert.match(exported.content, /no acredita autenticidad, firmeza ni ejecutoria/); assert.ok(exported.content.includes(originalCitation.quote)); assert.doesNotMatch(exported.content, /Rol 123-2026/); }
    await assert.rejects(updateBook(legacy.book.id, { revision: classified.book.revision, judicial: { caseNumber: "old-overwrite" } }, owner, db), status(409));
    const searched = await searchBooks({ query: "prueba pago", bookIds: [legacy.book.id] }, owner, db); assert.equal(searched.results[0].judicial?.caseNumber, "999-2026"); assert.equal(searched.coverage.networkRequests, 0); assert.ok(searched.warnings.some(warning => /datos judiciales/.test(warning)));
    // Classification and court identifiers grant no additional access, including to an administrator.
    assert.equal((await listBooks(outsider, db)).books.length, 0); await assert.rejects(readBook(legacy.book.id, outsider, {}, db), status(404));
    const collection = (await createBookCollection({ name: "Resoluciones ficticias compartidas" }, owner, db)).collection;
    const shared = (await updateBookCollection(collection.id, { revision: collection.revision, bookIds: [legacy.book.id], memberIds: [reader.id] }, owner, db)).collection;
    const cache = new Map<string, unknown>(); assert.equal((await resolveBookCitation(input, reader, { client: db, cache })).judicial?.caseNumber, "999-2026");
    await assert.rejects(updateBook(legacy.book.id, { revision: changed.book.revision, judicial: { court: "Reader overwrite" } }, reader, db), status(404));
    await updateBookCollection(collection.id, { revision: shared.revision, memberIds: [] }, owner, db);
    await assert.rejects(resolveBookCitation(input, reader, { client: db, cache }), status(404));
    // A strict audit failure rolls back both classification and its descriptive JSON.
    const rejectedAudit = db.$extends({ query: { auditEvent: { async create() { throw Error("Synthetic judicial audit failure"); } } } }) as unknown as PrismaClient;
    await assert.rejects(updateBook(legacy.book.id, { revision: changed.book.revision, judicial: { court: "Rollback court" } }, owner, rejectedAudit), status(500));
    assert.equal((await readBook(legacy.book.id, owner, {}, db)).book.judicial?.court, judicial.court);
    const unclassified = await updateBook(legacy.book.id, { revision: changed.book.revision, sourceType: "book" }, owner, db); assert.equal(unclassified.book.judicial, null); assert.equal((await db.libraryBook.findUniqueOrThrow({ where: { id: legacy.book.id } })).judicialJson, "{}");
    assert.equal((await readBookDraft(draft.draft.id, owner, db)).citations[0].sourceType, "book"); assert.match((await exportBookDraft(draft.draft.id, "txt", owner, db)).content, /Autora ficticia\. Fuente enteramente ficticia de prueba\. 2ª\. Editorial ficticia\. 2025/);
    // Judicial classification leaves physical PDF locators and optional retained-text conversion intact.
    const pdf = await readFile("src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf");
    const judgment = await importBook({ ...metadata, requestId: randomUUID(), name: "sentencia-ficticia.pdf", sourceType: "judgment", judicial, bytes: pdf }, owner, db);
    const pdfView = await readBook(judgment.book.id, owner, { page: 2 }, db), pdfFragment = pdfView.fragments[0]; assert.ok(pdfFragment);
    const pdfCitation = await resolveBookCitation({ bookId: judgment.book.id, fragmentId: pdfFragment.id, quote: pdfFragment.text }, owner, { client: db });
    assert.equal(pdfCitation.pageNumber, 2); assert.equal(pdfCitation.locatorLabel, "Página 2"); assert.equal(pdfCitation.extractionMethod, "ocr"); assert.equal(pdfCitation.sourceType, "judgment"); assert.equal((await readBookPage(judgment.book.id, 2, owner, db)).subarray(1, 4).toString(), "PNG");
    const ruling = await importBook({ ...metadata, requestId: randomUUID(), name: "resolucion-ficticia.pdf", sourceType: "ruling", judicial, bytes: pdf, convertToText: true, preserveOriginal: false }, owner, db);
    const retainedView = await readBook(ruling.book.id, owner, {}, db), retainedFragment = retainedView.fragments[0];
    const retained = await resolveBookCitation({ bookId: ruling.book.id, fragmentId: retainedFragment.id, quote: retainedFragment.text }, owner, { client: db });
    assert.equal(retained.sourceType, "ruling"); assert.equal(retained.verificationBasis, "retained_text"); assert.equal(retained.pageNumber, null); assert.match(retained.locatorLabel, /Texto retenido/); assert.equal(retained.sourceSha256, sha256(pdf)); assert.equal(sha256((await readBookText(ruling.book.id, owner, db)).bytes), retained.retainedSha256); await assert.rejects(readBookOriginal(ruling.book.id, owner, db), status(410)); await assert.rejects(readBookPage(ruling.book.id, 2, owner, db), status(404));
    assert.equal(networkCalls, 0);
    console.log("Judicial library PostgreSQL PASS: legacy citations and source keys, explicit classification, current court/rol/date references after edits, PDF physical page 2 plus OCR and image, retained text without original/page claims, bounded local RAG, private/shared/revoked access, CAS, strict audit rollback and zero external requests.");
  } finally { globalThis.fetch = fetchBefore; await db.auditEvent.deleteMany({ where: { actorId: { in: userIds } } }); await db.user.deleteMany({ where: { id: { in: userIds } } }); await db.$disconnect(); await rm(root, { recursive: true, force: true }); if (previousStorage === undefined) delete process.env.STORAGE_PATH; else process.env.STORAGE_PATH = previousStorage; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
