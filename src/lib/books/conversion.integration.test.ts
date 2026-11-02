import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile, readdir } from "node:fs/promises";
import { promises as fs } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { sha256 } from "@/lib/evidence/fragments";
import { discardBookImportAttempt } from "@/lib/storage";
import { bookMetadataSchema, readBookUpload } from "./ingest";
import { importBook, readBook, readBookOriginal, readBookPage, readBookText, resolveBookCitation, readBookPreferences, updateBookPreferences } from "./service";
import { createBookDraft, readBookDraft, exportBookDraft } from "./drafts";
import { searchBooks } from "./rag";
const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
async function storedFiles(root: string): Promise<string[]> {
  let entries; try { entries = await readdir(root, { withFileTypes: true }); } catch (error) { if ((error as { code?: string }).code === "ENOENT") return []; throw error; }
  const files: string[] = [];
  for (const entry of entries) { const target = path.join(root, entry.name); if (entry.isDirectory()) files.push(...await storedFiles(target)); else files.push(target); }
  return files.sort();
}
function heldTransactions(client: PrismaClient) {
  let entered!: () => void, release!: () => void;
  const enteredPromise = new Promise<void>(resolve => { entered = resolve; }), gate = new Promise<void>(resolve => { release = resolve; });
  const held = new Proxy(client, { get(target, property, receiver) { if (property === "$transaction") return async (...args: Parameters<PrismaClient["$transaction"]>) => { entered(); await gate; return (target.$transaction as (...values: unknown[]) => Promise<unknown>)(...args); }; return Reflect.get(target, property, receiver); } }) as PrismaClient;
  return { client: held, entered: enteredPromise, release };
}

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(url, process.env.DATABASE_URL);
  if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw Error("Local disposable storage required");
  const directory = await mkdtemp(path.join(tmpdir(), "lexopen-book-conversion-")), priorStorage = process.env.STORAGE_PATH; process.env.STORAGE_PATH = directory;
  const db = new PrismaClient({ datasources: { db: { url } } }); let userId = "", modelCalls = 0; const fetchBefore = globalThis.fetch; globalThis.fetch = (async () => { modelCalls++; throw Error("No remote model/network expected"); }) as typeof fetch;
  try {
    const owner = await db.user.create({ data: { email: `${randomUUID()}@conversion-fixture.invalid`, name: "Conversión ficticia", role: "abogado", password: "not-a-login" } }); userId = owner.id;
    const metadata = bookMetadataSchema.parse({ title: "Tratado de prueba", author: "Autora ficticia" }), pdf = await readFile("src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf");
    const base = { ...metadata, requestId: randomUUID(), name: "tratado.pdf", bytes: pdf };
    const defaults = await readBookPreferences(owner, db); assert.equal(defaults.defaultConvertToText, false); assert.equal(defaults.defaultPreserveOriginal, true); assert.equal(defaults.heavyFileThresholdMb, 10);
    await assert.rejects(importBook({ ...base, convertToText: false, preserveOriginal: false }, owner, db), status(400));
    const preserved = await importBook({ ...base, convertToText: true, preserveOriginal: true }, owner, db); assert.equal(preserved.book.originalRetained, true); assert.equal(preserved.book.convertedToText, true); assert.equal(preserved.book.retainedSha256, sha256(pdf)); assert.equal(preserved.book.originalBytes, pdf.length); assert.equal(preserved.book.retainedBytes, pdf.length); assert.equal(preserved.book.pageCount, 3);
    await assert.rejects(importBook({ ...base, convertToText: true, preserveOriginal: false }, owner, db), status(409));
    assert.equal((await importBook({ ...base, convertToText: true, preserveOriginal: true }, owner, db)).reused, true);
    const original = await readBookOriginal(preserved.book.id, owner, db); assert.deepEqual(original.bytes, pdf); const textWithOriginal = await readBookText(preserved.book.id, owner, db); assert.equal(textWithOriginal.verificationBasis, "original"); assert.ok(textWithOriginal.bytes.length);
    const pdfPage = (await readBook(preserved.book.id, owner, { page: 2 }, db)).fragments[0]; assert.equal((await resolveBookCitation({ bookId: preserved.book.id, fragmentId: pdfPage.id, quote: pdfPage.text }, owner, { client: db })).pageNumber, 2);
    const discarded = await importBook({ ...base, requestId: randomUUID(), convertToText: true, preserveOriginal: false }, owner, db); assert.equal(discarded.book.originalRetained, false); assert.equal(discarded.book.convertedToText, true); assert.equal(discarded.book.sourceSha256, sha256(pdf)); assert.equal(discarded.book.pageCount, null); assert.equal(discarded.book.locatorKind, "converted-text");
    const row = await db.libraryBook.findUniqueOrThrow({ where: { id: discarded.book.id } }); assert.equal(row.retainedSha256, sha256(Buffer.from(row.extractedText, "utf8"))); assert.equal(row.retainedBytes, Buffer.byteLength(row.extractedText, "utf8")); assert.notEqual(row.retainedSha256, row.sourceSha256); assert.equal(await db.libraryBookPage.count({ where: { bookId: row.id } }), 0);
    const stored = await readFile(path.join(directory, row.storageKey)); assert.deepEqual(stored, Buffer.from(row.extractedText, "utf8")); const bookFiles = await storedFiles(path.join(directory, "library-books", row.id)); assert.deepEqual(bookFiles, [path.join(directory, row.storageKey)]); assert.match(row.storageKey, /\/attempts\/[a-f0-9-]{36}\/text\/[a-f0-9]{64}$/);
    const view = await readBook(row.id, owner, {}, db); assert.deepEqual(view.pages, []); assert.equal(view.fragments.every(f => f.pageNumber === null && !/Página \d/.test(f.locatorLabel)), true);
    await assert.rejects(readBookOriginal(row.id, owner, db), status(410)); await assert.rejects(readBookPage(row.id, 2, owner, db), status(404));
    const retainedText = await readBookText(row.id, owner, db); assert.equal(retainedText.verificationBasis, "retained_text"); assert.deepEqual(retainedText.bytes, stored);
    const fragment = view.fragments[0], citationInput = { bookId: row.id, fragmentId: fragment.id, quote: fragment.text }, citation = await resolveBookCitation(citationInput, owner, { client: db }); assert.equal(citation.verificationBasis, "retained_text"); assert.equal(citation.retainedSha256, row.retainedSha256); assert.equal(citation.pageNumber, null); assert.equal(citation.extractionMethod, "ocr");
    const lookup = await searchBooks({ query: "pago", bookIds: [row.id] }, owner, db); assert.ok(lookup.results.length); assert.equal(lookup.results[0].verificationBasis, "retained_text"); assert.match(lookup.warnings.join(" "), /originales no están disponibles/);
    const draft = await createBookDraft({ requestId: randomUUID(), title: "Borrador con texto conservado", query: "pago", instruction: "Revisar las fuentes recuperadas", bookIds: [row.id], mode: "extractive" }, owner, db); assert.ok(draft.draft); const exported = await exportBookDraft(draft.draft.id, "txt", owner, db); assert.match(exported.content, /Texto conservado SHA-256/); assert.match(exported.content, /Original no conservado/); assert.doesNotMatch(exported.content, /Original SHA-256|Página 2/); assert.ok(exported.content.includes(row.retainedSha256!)); assert.match(draft.draft.warnings.join(" "), /texto conservado/);
    await db.libraryBookFragment.update({ where: { id: fragment.id }, data: { locatorLabel: "Página 2" } }); assert.equal((await resolveBookCitation(citationInput, owner, { client: db })).locatorLabel, `Texto retenido · fragmento ${fragment.ordinal}`); assert.equal((await exportBookDraft(draft.draft.id, "txt", owner, db)).content, exported.content); await db.libraryBookFragment.update({ where: { id: fragment.id }, data: { locatorLabel: fragment.locatorLabel } });
    await writeFile(path.join(directory, row.storageKey), Buffer.from("Texto alterado")); await assert.rejects(readBookText(row.id, owner, db), status(409)); await assert.rejects(resolveBookCitation(citationInput, owner, { client: db }), status(409)); await assert.rejects(exportBookDraft(draft.draft.id, "txt", owner, db), status(409)); await writeFile(path.join(directory, row.storageKey), stored);
    // Simulate migrated 37 rows and saved citations with no retention fields; original source keys stay valid.
    const legacy = await importBook({ ...base, requestId: randomUUID(), convertToText: false, preserveOriginal: true }, owner, db); const legacyDraft = await createBookDraft({ requestId: randomUUID(), title: "Borrador anterior", query: "pago", instruction: "Revisar la fuente", bookIds: [legacy.book.id], mode: "extractive" }, owner, db); assert.ok(legacyDraft.draft);
    const legacyCitations = legacyDraft.draft.citations.map(c => { const copy = { ...c }; delete copy.verificationBasis; delete copy.retainedSha256; return copy; });
    await db.libraryBook.update({ where: { id: legacy.book.id }, data: { retainedSha256: null, originalBytes: null, retainedBytes: null, conversionJson: "{}" } }); await db.libraryWritingDraft.update({ where: { id: legacyDraft.draft.id }, data: { citationsJson: JSON.stringify(legacyCitations) } }); assert.equal((await readBookDraft(legacyDraft.draft.id, owner, db)).citations[0].sourceKey, legacyCitations[0].sourceKey); assert.match((await exportBookDraft(legacyDraft.draft.id, "txt", owner, db)).content, /Original SHA-256/);
    await updateBookPreferences({ defaultConvertToText: true, defaultPreserveOriginal: false, heavyFileThresholdMb: 1 }, owner, db); await updateBookPreferences({ libraryName: "Nombre compatible anterior", shelfTheme: "oak", view: "spines" }, owner, db); const preferences = await readBookPreferences(owner, db); assert.equal(preferences.defaultConvertToText, true); assert.equal(preferences.defaultPreserveOriginal, false); assert.equal(preferences.heavyFileThresholdMb, 1);
    await assert.rejects(updateBookPreferences({ heavyFileThresholdMb: 26 }, owner, db)); await assert.rejects(updateBookPreferences({ defaultConvertToText: false }, owner, db), status(400));
    const heavy = Buffer.from("Contrato y prueba.\n".repeat(70_000)); assert.ok(heavy.length > 1024 * 1024 && heavy.length < 2_000_000); const heavyBook = await importBook({ ...metadata, requestId: randomUUID(), name: "tratado-pesado.txt", bytes: heavy }, owner, db); assert.equal(heavyBook.book.convertedToText, true); assert.equal(heavyBook.book.originalRetained, false); assert.equal(heavyBook.book.originalBytes, heavy.length);
    const form = new FormData(); form.set("file", new File(["Texto para importar"], "texto.txt")); form.set("requestId", randomUUID()); form.set("convertToText", "true"); form.set("preserveOriginal", "false"); const parsed = await readBookUpload(new Request("http://fixture.invalid", { method: "POST", body: form })); assert.equal(parsed.convertToText, true); assert.equal(parsed.preserveOriginal, false);
    // Pause a preserve-original attempt only after its upload, then commit TXT-only as winner.
    const raceInput = { ...metadata, requestId: randomUUID(), name: "racing.txt", bytes: Buffer.from("Antecedentes originales de prueba del contrato."), convertToText: true };
    const firstHeld = heldTransactions(db), firstAttempt = importBook({ ...raceInput, preserveOriginal: true }, owner, firstHeld.client).then(value => ({ value }), error => ({ error }));
    await firstHeld.entered;
    const textWinner = await importBook({ ...raceInput, preserveOriginal: false }, owner, db); firstHeld.release();
    const firstResult = await firstAttempt; assert.ok("error" in firstResult); assert.equal((firstResult.error as { status?: number }).status, 409);
    const winningRow = await db.libraryBook.findUniqueOrThrow({ where: { id: textWinner.book.id } }); assert.equal(winningRow.originalRetained, false); assert.deepEqual(await storedFiles(path.join(directory, "library-books", winningRow.id)), [path.join(directory, winningRow.storageKey)]); assert.deepEqual(await readFile(path.join(directory, winningRow.storageKey)), Buffer.from(winningRow.extractedText, "utf8")); assert.doesNotMatch(winningRow.storageKey, /\/original\//);
    // An audit rollback must remove its own original before a TXT-only retry with the same key.
    const rollbackInput = { ...raceInput, requestId: randomUUID() }, failAudit = db.$extends({ query: { auditEvent: { async create() { throw Error("Synthetic import attempt audit failure"); } } } }) as unknown as PrismaClient;
    await assert.rejects(importBook({ ...rollbackInput, preserveOriginal: true }, owner, failAudit), status(500));
    const rollbackId = `book_${sha256(`${owner.id}:${rollbackInput.requestId}`).slice(0, 40)}`; assert.deepEqual(await storedFiles(path.join(directory, "library-books", rollbackId)), []);
    const afterRollback = await importBook({ ...rollbackInput, preserveOriginal: false }, owner, db), afterRow = await db.libraryBook.findUniqueOrThrow({ where: { id: afterRollback.book.id } }); assert.deepEqual(await storedFiles(path.join(directory, "library-books", afterRow.id)), [path.join(directory, afterRow.storageKey)]); assert.doesNotMatch(afterRow.storageKey, /\/original\//);
    // Same-options concurrent replay removes only the losing attempt, never the committed object.
    const sameInput = { ...raceInput, requestId: randomUUID(), preserveOriginal: false }, sameHeld = heldTransactions(db), sameAttempt = importBook(sameInput, owner, sameHeld.client);
    await sameHeld.entered; const sameWinner = await importBook(sameInput, owner, db); sameHeld.release(); const sameReplay = await sameAttempt; assert.equal(sameReplay.reused, true); assert.equal(sameReplay.book.id, sameWinner.book.id);
    const sameRow = await db.libraryBook.findUniqueOrThrow({ where: { id: sameWinner.book.id } }); assert.deepEqual(await storedFiles(path.join(directory, "library-books", sameRow.id)), [path.join(directory, sameRow.storageKey)]); assert.deepEqual((await readBookText(sameRow.id, owner, db)).bytes, Buffer.from(sameRow.extractedText, "utf8"));
    // A storage write may leave bytes before reporting failure; compensation still owns that key.
    const partialInput = { ...raceInput, requestId: randomUUID(), preserveOriginal: true }, partialId = `book_${sha256(`${owner.id}:${partialInput.requestId}`).slice(0, 40)}`, partialRoot = path.join(directory, "library-books", partialId), writeBefore = fs.writeFile;
    fs.writeFile = (async (...args: Parameters<typeof fs.writeFile>) => { if (typeof args[0] === "string" && args[0].startsWith(partialRoot + path.sep)) { await writeBefore(args[0], Buffer.from("partial fixture write")); throw Object.assign(Error("Synthetic partial write failure"), { code: "EIO" }); } return writeBefore(...args); }) as typeof fs.writeFile;
    try { await assert.rejects(importBook(partialInput, owner, db), error => (error as { code?: string }).code === "EIO"); } finally { fs.writeFile = writeBefore; }
    assert.deepEqual(await storedFiles(partialRoot), []); assert.equal(await db.libraryBook.count({ where: { id: partialId } }), 0);
    // Cleanup failure is actionable and retains both causes instead of concealing the failed audit.
    const cleanupInput = { ...raceInput, requestId: randomUUID(), preserveOriginal: true }, cleanupId = `book_${sha256(`${owner.id}:${cleanupInput.requestId}`).slice(0, 40)}`, cleanupRoot = path.join(directory, "library-books", cleanupId), rmBefore = fs.rm;
    fs.rm = (async (...args: Parameters<typeof fs.rm>) => { if (typeof args[0] === "string" && args[0].startsWith(cleanupRoot + path.sep)) throw Error("Synthetic attempt cleanup failure"); return rmBefore(...args); }) as typeof fs.rm;
    try { await assert.rejects(importBook(cleanupInput, owner, failAudit), error => { assert.ok(error instanceof AggregateError); assert.equal((error as AggregateError & { status?: number }).status, 503); assert.equal(error.errors.length, 2); assert.equal((error.cause as { status?: number }).status, 500); assert.match(error.message, /administrador del almacenamiento/); return true; }); } finally { fs.rm = rmBefore; }
    const cleanupFiles = await storedFiles(cleanupRoot); assert.equal(cleanupFiles.length, 1); await discardBookImportAttempt(path.relative(directory, cleanupFiles[0]).split(path.sep).join("/")); assert.deepEqual(await storedFiles(cleanupRoot), []); assert.equal(await db.libraryBook.count({ where: { id: cleanupId } }), 0);
    assert.equal(modelCalls, 0); console.log("Book text retention PostgreSQL PASS: explicit conversion/original choices and replay conflicts, physical PDF/OCR retained when chosen, TXT-only storage with original hash provenance, original410 and no fake PDF page, text/citation/export tamper409, retained-text RAG footnotes, migrated37 original/citation compatibility, per-user defaults and partial PATCH preservation, heavy text threshold and strict multipart options, per-attempt object cleanup for opposing-option races/audit rollback/same-option replay while retaining only the committed winner, partial writes compensated and cleanup failure returns503 with both causes; model/network calls 0.");
  } finally { globalThis.fetch = fetchBefore; if (userId) { await db.auditEvent.deleteMany({ where: { actorId: userId } }); await db.user.delete({ where: { id: userId } }); } await db.$disconnect(); await rm(directory, { recursive: true, force: true }); if (priorStorage === undefined) delete process.env.STORAGE_PATH; else process.env.STORAGE_PATH = priorStorage; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
