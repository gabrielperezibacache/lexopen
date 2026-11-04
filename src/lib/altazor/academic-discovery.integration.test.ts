/** New rows in an explicitly disposable database; injected fictitious transports. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { sha256 } from "@/lib/evidence/fragments";
import { academicSearchFeed, listAcademicSearches, patchAcademicSearch, refreshAcademicSearch, saveAcademicSearch, searchAcademicDiscovery } from "./academic-discovery";
import { addBibliography, deleteBibliographyEntry, exportBibliography, importBibliographyEntries, listBibliography } from "./bibliography-service";

const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  const db = new PrismaClient({ datasources: { db: { url } } }), tag = randomUUID(), users: string[] = [], books: string[] = [];
  const originalFetch = globalThis.fetch; let network = 0, fixtureCalls = 0, generation = "first", unavailable = false;
  globalThis.fetch = (async () => { network++; throw Error("Unexpected real network in discovery fixture"); }) as typeof fetch;
  const fake: typeof fetch = async (input, init) => {
    fixtureCalls++; assert.equal(init?.redirect, "error"); if (unavailable) throw Error("Fictitious provider outage");
    const address = new URL(String(input)), doi = address.pathname === "/works" ? `10.5555/fictitious-${generation}` : decodeURIComponent(address.pathname.replace("/works/", ""));
    const paper = { DOI: doi, title: [`Resultado ficticio ${generation} & fuente`], author: [{ family: "Ficticia", given: "Ana" }], published: { "date-parts": [[2024]] }, "container-title": ["Revista ficticia"], type: "journal-article" };
    return new Response(JSON.stringify({ message: address.pathname === "/works" ? { items: [paper] } : paper }), { headers: { "Content-Type": "application/json" } });
  };
  try {
    const owner = await db.user.create({ data: { name: "Investigador ficticio", email: `${tag}@discovery.invalid`, role: "abogado", password: "not-a-login" } }); users.push(owner.id);
    const other = await db.user.create({ data: { name: "Otro profesional ficticio", email: `${tag}-other@discovery.invalid`, role: "abogado", password: "not-a-login" } }); users.push(other.id);
    await assert.rejects(searchAcademicDiscovery({ query: "tema ficticio", providers: ["crossref"], allowExternal: false }, owner, db, { fetch: fake }), status(403)); assert.equal(fixtureCalls, 0);
    const saved = await saveAcademicSearch({ requestId: tag, name: "Tema <ficticio> & fuentes", query: "tema público ficticio", providers: ["crossref"] }, owner, db), id = saved.search.id;
    assert.equal((await saveAcademicSearch({ requestId: tag, name: "Tema <ficticio> & fuentes", query: "tema público ficticio", providers: ["crossref"] }, owner, db)).reused, true);
    assert.equal((await listAcademicSearches(other, db)).searches.length, 0);
    await assert.rejects(refreshAcademicSearch(id, { expectedRevision: 1, allowExternal: true }, other, db, { fetch: fake }), status(404));
    const first = await refreshAcademicSearch(id, { expectedRevision: 1, allowExternal: true }, owner, db, { fetch: fake }); assert.equal(first.search.results.length, 1); assert.deepEqual(first.search.newKeys, []); assert.equal(first.search.revision, 2);
    generation = "second"; const updated = await refreshAcademicSearch(id, { expectedRevision: 2, allowExternal: true }, owner, db, { fetch: fake }); assert.deepEqual(updated.search.newKeys, ["doi:10.5555/fictitious-second"]);
    const beforeFeed = fixtureCalls, feed = await academicSearchFeed(id, owner, db); assert.match(feed, /Tema &lt;ficticio&gt; &amp; fuentes/); assert.match(feed, /second &amp; fuente/); assert.equal(fixtureCalls, beforeFeed, "RSS must use cached metadata without outbound traffic");
    await assert.rejects(academicSearchFeed(id, other, db), status(404));
    await patchAcademicSearch(id, { expectedRevision: 3, action: "acknowledge" }, owner, db);
    const seen = await refreshAcademicSearch(id, { expectedRevision: 4, allowExternal: true }, owner, db, { fetch: fake }); assert.deepEqual(seen.search.newKeys, []);
    unavailable = true; await assert.rejects(refreshAcademicSearch(id, { expectedRevision: 5, allowExternal: true }, owner, db, { fetch: fake }), status(502)); unavailable = false;
    const cached = (await listAcademicSearches(owner, db)).searches[0]; assert.equal(cached.checkedAt, seen.search.checkedAt); assert.equal(cached.results.length, 1); assert.equal(cached.errorCode, "sources_unavailable");
    await patchAcademicSearch(id, { expectedRevision: 5, action: "pause" }, owner, db); await assert.rejects(refreshAcademicSearch(id, { expectedRevision: 6, allowExternal: true }, owner, db, { fetch: fake }), status(409));
    await assert.rejects(addBibliography({ kind: "remote", requestId: `no-consent-${tag}`, provider: "crossref", identifier: "10.5555/fictitious-reference", allowExternal: false }, owner, db, { fetch: fake }), status(403));
    const added = await addBibliography({ kind: "remote", requestId: `reference-${tag}`, provider: "crossref", identifier: "10.5555/fictitious-reference", allowExternal: true }, owner, db, { fetch: fake }); assert.equal(added.added, 1);
    assert.equal((await addBibliography({ kind: "remote", requestId: `reference-${tag}`, provider: "crossref", identifier: "10.5555/fictitious-reference", allowExternal: true }, owner, db, { fetch: fake })).reused, 1);
    await importBibliographyEntries({ requestId: `import-${tag}`, format: "ris", content: "TY  - JOUR\nTI  - Título aportado distinto\nDO  - 10.5555/fictitious-reference\nER  - \n" }, owner, db);
    const bibliography = await listBibliography(owner, db); assert.equal(bibliography.entries.length, 1); assert.equal(bibliography.entries[0].available, true); assert.equal("metadata" in bibliography.entries[0] && bibliography.entries[0].metadata?.title, "Resultado ficticio second & fuente", "unverified import cannot overwrite registered metadata");
    assert.equal((await listBibliography(other, db)).entries.length, 0); await assert.rejects(deleteBibliographyEntry(added.ids[0], other, db), status(404));
    const book = await db.libraryBook.create({ data: { ownerId: owner.id, requestId: `book-${tag}`, title: "Libro propio ficticio", author: "Autora ficticia", year: "2024", publisher: "Editorial ficticia", sourceName: "fixture.txt", mimeType: "text/plain", storageKey: `fictitious-never-read/${tag}`, sourceSha256: sha256("fictitious"), textSha256: sha256("fictitious"), extractedText: "fictitious" } }); books.push(book.id);
    await assert.rejects(addBibliography({ kind: "book", requestId: `book-other-${tag}`, bookId: book.id }, other, db), status(404));
    await addBibliography({ kind: "book", requestId: `book-reference-${tag}`, bookId: book.id }, owner, db);
    assert.equal((await exportBibliography(owner, "bibtex", db)).count, 2);
    await db.libraryBook.update({ where: { id: book.id }, data: { deletedAt: new Date() } });
    const exported = await exportBibliography(owner, "ris", db); assert.equal(exported.count, 1); assert.equal(exported.excluded, 1); assert.doesNotMatch(exported.body, /Libro propio ficticio/);
    await db.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "assistant.use" } }); await assert.rejects(exportBibliography(owner, "apa", db), status(403));
    assert.equal(network, 0);
    console.log("Discovery disposable integration passed: owner-only saved searches/RSS, explicit query consent, manual refresh/deltas/outage cache, DOI metadata dedupe, inert imports, seven-style export service, own-book live revocation, zero provider traffic.");
  } finally {
    globalThis.fetch = originalFetch;
    await db.altazorAcademicSearch.deleteMany({ where: { ownerId: { in: users } } }); await db.altazorBibliographyEntry.deleteMany({ where: { ownerId: { in: users } } }); await db.libraryBook.deleteMany({ where: { id: { in: books } } }); await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
