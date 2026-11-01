import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { sha256 } from "@/lib/evidence/fragments";
import { importBook, listBooks, readBook, updateBook, deleteBook, readBookOriginal, readBookPage, resolveBookCitation, createBookCollection, readBookCollection, updateBookCollection, deleteBookCollection, readBookPreferences, updateBookPreferences, listBookPeople } from "./service";
import { bookMetadataSchema } from "./ingest";
import { createBookDraft, exportBookDraft } from "./drafts";
const status = (value: number) => (e: unknown) => (e as { status?: number }).status === value;
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(url, process.env.DATABASE_URL);
  if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw Error("Requires local fixture storage");
  const root = await mkdtemp(path.join(tmpdir(), "lexopen-books-integration-")), priorStorage = process.env.STORAGE_PATH; process.env.STORAGE_PATH = root;
  const db = new PrismaClient({ datasources: { db: { url } } }), ids: string[] = [], tag = randomUUID();
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = (async () => { calls++; throw Error("Unexpected remote call"); }) as typeof fetch;
  try {
    const users = [];
    for (const role of ["abogado", "abogado", "admin", "cliente"]) { const user = await db.user.create({ data: { email: `${randomUUID()}@book-fixture.invalid`, name: `Book fixture ${role}`, password: "not-a-real-login", role } }); users.push(user); ids.push(user.id); }
    const [owner, reader, outsider, portal] = users;
    const input = { ...bookMetadataSchema.parse({ title: `Tratado ficticio ${tag}`, author: "Autora de prueba", year: "2025", edition: "Segunda", publisher: "Editorial ficticia" }), requestId: randomUUID(), name: "tratado.txt", bytes: Buffer.from("📚 La buena fe objetiva gobierna el contrato.\n\nLa prueba del pago debe fundarse en antecedentes comprobables.") };
    const pair = await Promise.all([importBook(input, owner, db), importBook(input, owner, db)]); assert.equal(pair[0].book.id, pair[1].book.id); assert.equal(pair.filter(r => r.reused).length, 1);
    const book = pair[0].book; assert.equal(book.owned, true); assert.equal((await listBooks(reader, db)).books.length, 0); assert.equal((await listBooks(outsider, db)).books.length, 0);
    await assert.rejects(importBook({ ...input, bytes: Buffer.from("Different file") }, owner, db), status(409));
    await assert.rejects(readBook(book.id, outsider, {}, db), status(404)); await assert.rejects(listBooks(portal, db), status(403));
    const detail = await readBook(book.id, owner, {}, db), fragment = detail.fragments[0], citationInput = { bookId: book.id, fragmentId: fragment.id, quote: "La buena fe objetiva gobierna el contrato." };
    const verified = await resolveBookCitation(citationInput, owner, { client: db }); assert.equal(verified.pageNumber, null); assert.equal(verified.author, input.author); assert.equal(verified.sourceSha256, sha256(input.bytes)); assert.ok(verified.href.includes(`/biblioteca/${book.id}`)); assert.equal(verified.partial, false);
    await assert.rejects(resolveBookCitation({ ...citationInput, quote: "La ley dice algo inventado." }, owner, { client: db }), status(409));
    const changed = await updateBook(book.id, { revision: book.revision, title: "Título personal", coverColor: "forest", shelf: "Obligaciones", favorite: true }, owner, db); assert.equal(changed.book.revision, 2); assert.equal(changed.book.sourceSha256, book.sourceSha256);
    await assert.rejects(updateBook(book.id, { revision: book.revision, title: "Old overwrite" }, owner, db), status(409)); assert.equal((await importBook(input, owner, db)).book.title, "Título personal");
    const collection = (await createBookCollection({ name: "Doctrina elegida" }, owner, db)).collection;
    const shared = (await updateBookCollection(collection.id, { revision: collection.revision, bookIds: [book.id], memberIds: [reader.id] }, owner, db)).collection;
    const sharedBook = (await listBooks(reader, db)).books.find(row => row.id === book.id); assert.equal(sharedBook?.owned, false); assert.equal((await readBookCollection(collection.id, reader, db)).collection.memberIds.length, 0);
    await assert.rejects(updateBook(book.id, { revision: 2, title: "Reader overwrite" }, reader, db), status(404));
    await assert.rejects(updateBookCollection(collection.id, { revision: shared.revision, memberIds: [portal.id] }, owner, db), status(403));
    const readCache = new Map<string, unknown>(); await resolveBookCitation(citationInput, reader, { client: db, cache: readCache });
    const revoked = (await updateBookCollection(collection.id, { revision: shared.revision, memberIds: [] }, owner, db)).collection;
    await assert.rejects(resolveBookCitation(citationInput, reader, { client: db, cache: readCache }), status(404)); await assert.rejects(readBookOriginal(book.id, reader, db), status(404));
    await updateBookCollection(collection.id, { revision: revoked.revision, memberIds: [reader.id] }, owner, db);
    await db.user.update({ where: { id: reader.id }, data: { capabilityRevokes: "assistant.use" } }); await assert.rejects(resolveBookCitation(citationInput, reader, { client: db, cache: readCache }), status(403)); await db.user.update({ where: { id: reader.id }, data: { capabilityRevokes: "" } });
    await db.user.update({ where: { id: owner.id }, data: { role: "cliente" } }); assert.equal((await listBooks(reader, db)).books.length, 0); await assert.rejects(readBook(book.id, reader, {}, db), status(404)); await db.user.update({ where: { id: owner.id }, data: { role: "abogado" } });
    const row = await db.libraryBook.findUniqueOrThrow({ where: { id: book.id } });
    await writeFile(path.join(root, row.storageKey), Buffer.from("tampered original")); await assert.rejects(resolveBookCitation(citationInput, owner, { client: db }), status(409)); await assert.rejects(readBookOriginal(book.id, owner, db), status(409)); await writeFile(path.join(root, row.storageKey), input.bytes);
    const storedFragment = await db.libraryBookFragment.findUniqueOrThrow({ where: { id: fragment.id } }); await db.libraryBookFragment.update({ where: { id: fragment.id }, data: { text: "Texto alterado", textSha256: sha256("Texto alterado") } }); await assert.rejects(resolveBookCitation({ ...citationInput, quote: "Texto alterado" }, owner, { client: db }), status(409)); await db.libraryBookFragment.update({ where: { id: fragment.id }, data: { text: storedFragment.text, textSha256: storedFragment.textSha256 } });
    // JS slice clamps overlong endpoints: the verifier must reject them explicitly.
    await db.libraryBookFragment.update({ where: { id: fragment.id }, data: { endOffset: row.extractedText.length + 100 } });
    await assert.rejects(resolveBookCitation(citationInput, owner, { client: db }), status(409));
    await db.libraryBookFragment.update({ where: { id: fragment.id }, data: { endOffset: storedFragment.endOffset } });
    const epub = await importBook({ ...input, requestId: randomUUID(), name: "tratado.epub", bytes: await readFile("src/lib/books/fixtures/juridical-fixture.epub") }, owner, db); const epubView = await readBook(epub.book.id, owner, {}, db); const epubCite = await resolveBookCitation({ bookId: epub.book.id, fragmentId: epubView.fragments[1].id, quote: epubView.fragments[1].text }, owner, { client: db }); assert.equal(epubCite.pageNumber, null); assert.match(epubCite.locatorLabel, /Sección 2/);
    const pdf = await importBook({ ...input, requestId: randomUUID(), name: "physical.pdf", bytes: await readFile("src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf") }, owner, db); const pdfView = await readBook(pdf.book.id, owner, { page: 2 }, db); const pdfCite = await resolveBookCitation({ bookId: pdf.book.id, fragmentId: pdfView.fragments[0].id, quote: pdfView.fragments[0].text }, owner, { client: db }); assert.equal(pdfCite.pageNumber, 2); assert.equal(pdfCite.extractionMethod, "ocr"); const image = await readBookPage(pdf.book.id, 2, owner, db); assert.equal(image.subarray(1, 4).toString(), "PNG");
    const pdfFragment = await db.libraryBookFragment.findUniqueOrThrow({ where: { id: pdfView.fragments[0].id } }); await db.libraryBookFragment.update({ where: { id: pdfFragment.id }, data: { pageNumber: 1 } }); await assert.rejects(resolveBookCitation({ bookId: pdf.book.id, fragmentId: pdfFragment.id, quote: pdfFragment.text }, owner, { client: db }), status(409)); await db.libraryBookFragment.update({ where: { id: pdfFragment.id }, data: { pageNumber: 2 } });
    const pdfInput = { bookId: pdf.book.id, fragmentId: pdfFragment.id, quote: pdfFragment.text };
    const pagesBefore = await db.libraryBookPage.findMany({ where: { bookId: pdf.book.id }, orderBy: { pageNumber: "asc" } });
    const pageOne = pagesBefore[0], pageTwo = pagesBefore[1];
    // A coherent page text/hash forgery must not relocate page 2's real fragment to page 1.
    await db.libraryBookPage.update({ where: { id: pageOne.id }, data: { text: pageTwo.text, textSha256: pageTwo.textSha256 } });
    await db.libraryBookFragment.update({ where: { id: pdfFragment.id }, data: { pageNumber: 1 } });
    await assert.rejects(resolveBookCitation(pdfInput, owner, { client: db }), status(409));
    await db.libraryBookPage.update({ where: { id: pageOne.id }, data: { text: pageOne.text, textSha256: pageOne.textSha256 } });
    await db.libraryBookFragment.update({ where: { id: pdfFragment.id }, data: { pageNumber: 2, pageEndOffset: pageTwo.text.length + 100 } });
    await assert.rejects(resolveBookCitation(pdfInput, owner, { client: db }), status(409));
    await db.libraryBookFragment.update({ where: { id: pdfFragment.id }, data: { pageEndOffset: pdfFragment.pageEndOffset } });
    // Keep a valid same-page substring but alter its global location; both coordinate systems bind.
    await db.libraryBookFragment.update({ where: { id: pdfFragment.id }, data: { startOffset: pdfFragment.startOffset + 1, endOffset: pdfFragment.endOffset + 1 } });
    await assert.rejects(resolveBookCitation(pdfInput, owner, { client: db }), status(409));
    await db.libraryBookFragment.update({ where: { id: pdfFragment.id }, data: { startOffset: pdfFragment.startOffset, endOffset: pdfFragment.endOffset } });
    assert.equal((await resolveBookCitation(pdfInput, owner, { client: db, cache: new Map() })).pageNumber, 2);
    const labelDraft = await createBookDraft({ requestId: randomUUID(), title: "Cita física de prueba", query: "pago", instruction: "Conservar los pasajes para revisión", bookIds: [pdf.book.id], collectionIds: [], existingText: "", mode: "extractive" }, owner, db);
    assert.ok(labelDraft.draft);
    assert.ok(labelDraft.draft.citations.some(c => c.fragmentId === pdfFragment.id && c.pageNumber === 2));
    const exportBefore = await exportBookDraft(labelDraft.draft.id, "txt", owner, db);
    // Locator display cannot contradict the corroborated physical page, even after label-only corruption.
    await db.libraryBookFragment.update({ where: { id: pdfFragment.id }, data: { locatorLabel: "Página 1" } });
    const canonicalLabel = await resolveBookCitation(pdfInput, owner, { client: db });
    assert.equal(canonicalLabel.pageNumber, 2); assert.equal(canonicalLabel.locatorLabel, "Página 2");
    const exportAfter = await exportBookDraft(labelDraft.draft.id, "txt", owner, db);
    assert.equal(exportAfter.content, exportBefore.content);
    await db.libraryBookFragment.update({ where: { id: pdfFragment.id }, data: { locatorLabel: pdfFragment.locatorLabel } });
    await updateBookPreferences({ libraryName: "La biblioteca de prueba", shelfTheme: "oak", view: "spines" }, owner, db); assert.equal((await readBookPreferences(owner, db)).shelfTheme, "oak"); assert.equal((await readBookPreferences(reader, db)).libraryName, "Mi biblioteca jurídica"); assert.equal((await listBookPeople(owner, db)).people.some(person => person.id === portal.id), false);
    for (const layout of ["mesa", "estantes", "gabinete", "galeria", "archivo", "salon"] as const) { await updateBookPreferences({ libraryName: "Mi biblioteca", shelfTheme: "walnut", view: "covers", layout }, owner, db); assert.equal((await readBookPreferences(owner, db)).layout, layout); }
    await assert.rejects(updateBookPreferences({ libraryName: "Mi biblioteca", shelfTheme: "walnut", view: "covers", layout: "unknown" }, owner, db));
    const foreign = await importBook({ ...input, requestId: randomUUID() }, outsider, db); const currentCollection = (await readBookCollection(collection.id, owner, db)).collection; await assert.rejects(updateBookCollection(collection.id, { revision: currentCollection.revision, bookIds: [foreign.book.id] }, owner, db), status(404));
    let failAudit = true; const extended = db.$extends({ query: { auditEvent: { async create({ args, query }) { if (failAudit) throw Error("Synthetic book audit failure"); return query(args); } } } }) as unknown as PrismaClient;
    await assert.rejects(updateBook(book.id, { revision: changed.book.revision, title: "Rollback me" }, owner, extended), status(500)); assert.equal((await readBook(book.id, owner, {}, db)).book.title, "Título personal"); failAudit = false;
    const rollbackInput = { ...input, requestId: randomUUID() }; failAudit = true; await assert.rejects(importBook(rollbackInput, owner, extended), status(500)); assert.equal(await db.libraryBook.count({ where: { ownerId: owner.id, requestId: rollbackInput.requestId } }), 0); failAudit = false;
    await assert.rejects(deleteBook(book.id, { revision: 1 }, owner, db), status(409)); await deleteBook(book.id, { revision: changed.book.revision }, owner, db); await assert.rejects(resolveBookCitation(citationInput, owner, { client: db, cache: readCache }), status(404)); await assert.rejects(readBookOriginal(book.id, reader, db), status(404));
    await deleteBookCollection(collection.id, { revision: currentCollection.revision }, owner, db); await assert.rejects(readBookCollection(collection.id, reader, db), status(404));
    assert.equal(calls, 0); console.log("Personal book library PostgreSQL PASS: private ownership incl admin denial, concurrent import replay/CAS, personalization, explicit read-only collections and revocation, current actor/owner role/capability, exact original/text/Unicode/fragment hashes, EPUB sections, physical PDF/OCR page2/image, whole-PDF page/text coordinate binding and coherent-page/global/local-range tamper rejection and canonical PDF label through export after label-only corruption, preferences isolation, audit rollback and soft-removal derivative denial; network/model calls 0.");
  } finally { globalThis.fetch = originalFetch; await db.auditEvent.deleteMany({ where: { actorId: { in: ids } } }); await db.user.deleteMany({ where: { id: { in: ids } } }); await db.$disconnect(); await rm(root, { recursive: true, force: true }); if (priorStorage === undefined) delete process.env.STORAGE_PATH; else process.env.STORAGE_PATH = priorStorage; }
}
void main().catch(e => { console.error(e); process.exitCode = 1; });
