import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:http";
import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { hash } from "bcryptjs";
import { request } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";

async function main() {
  assert.equal(process.env.NODE_ENV, "production"); assert.notEqual(process.env.LEXOPEN_E2E, "1"); assert.notEqual(process.env.LEXOPEN_RELAX_CSRF, "1");
  const base = process.env.PROD_TEST_BASE_URL!; assert.ok(base && ["127.0.0.1", "localhost"].includes(new URL(base).hostname));
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(url, process.env.DATABASE_URL); assert.ok(process.env.STORAGE_PATH);
  const db = new PrismaClient({ datasources: { db: { url } } }), tag = randomUUID(), password = `Fixture-${randomUUID()}`;
  const api = await request.newContext({ baseURL: base }), member = await request.newContext({ baseURL: base }), portal = await request.newContext({ baseURL: base });
  const users: string[] = [], bookIds: string[] = [], keys: string[] = []; let orgId = "", calls = 0, invalidModel = false, providerCreated = false;
  const model = createServer(async (req, res) => {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const payload = JSON.parse(Buffer.concat(chunks).toString()); assert.equal(req.url, "/v1/chat/completions"); assert.ok(JSON.stringify(payload).includes("NO CONFIABLES")); calls++;
    res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ paragraphs: [{ text: invalidModel ? "Cita «una frase ficticia inventada que no figura en la fuente»" : "El pasaje ficticio permite organizar el contraste de la prueba del contrato.", citationIds: ["S1"] }] }) } }] }));
  });
  await new Promise<void>(resolve => model.listen(0, "127.0.0.1", resolve)); const modelPort = (model.address() as { port: number }).port;
  try {
    assert.equal(await db.integrationConfig.count({ where: { provider: "llm" } }), 0, "Disposable fixture requires no existing provider");
    const org = await db.organization.create({ data: { name: `Biblioteca ficticia ${tag}`, settings: { create: { assistantLlmMode: "local_only", require2faPrivileged: true } } } }); orgId = org.id;
    for (const role of ["abogado", "abogado", "cliente"]) { const user = await db.user.create({ data: { email: `${randomUUID()}@book-production.invalid`, name: `Profesional ficticio ${role}`, role, password: await hash(password, 10) } }); users.push(user.id); }
    const subjects = await Promise.all(users.map(id => db.user.findUniqueOrThrow({ where: { id } })));
    async function login(context: typeof api, index: number) { const response = await context.post("/api/auth/login", { headers: { Origin: base }, data: { email: subjects[index].email, password } }); assert.equal(response.status(), 200, await response.text()); const state = await context.storageState(), token = state.cookies.find(c => c.name === "lexopen_csrf")?.value; assert.ok(token); return { Origin: base, "x-csrf-token": token! }; }
    const headers = await login(api, 0), memberHeaders = await login(member, 1); await login(portal, 2);
    for (const extension of ["txt", "epub", "docx", "pdf"]) {
      const file = extension === "pdf" ? "src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf" : `src/lib/books/fixtures/juridical-fixture.${extension}`, bytes = await readFile(file);
      const response = await api.post("/api/books", { headers, multipart: { requestId: randomUUID(), title: `Libro ficticio ${extension}`, author: "Autora ficticia", year: "2026", file: { name: `ficticio.${extension}`, mimeType: "application/octet-stream", buffer: bytes } } }); assert.equal(response.status(), 201, await response.text()); const book = (await response.json()).book; bookIds.push(book.id);
      const original = await api.get(`/api/books/${book.id}/original`); assert.equal(original.status(), 200); assert.deepEqual(await original.body(), bytes); assert.match(original.headers()["content-disposition"], /attachment/); assert.match(original.headers()["cache-control"], /no-store/);
      assert.equal(book.sourceSha256, createHash("sha256").update(bytes).digest("hex"));
    }
    const textId = bookIds[0], pdfId = bookIds[3];
    const convertedResponse = await api.post("/api/books", { headers, multipart: { requestId: randomUUID(), title: "PDF ficticio conservado como texto", convertToText: "true", preserveOriginal: "false", file: { name: "convertido.pdf", mimeType: "application/pdf", buffer: await readFile("src/lib/evidence/pdf-fixtures/mixed-three-pages.pdf") } } });
    assert.equal(convertedResponse.status(), 201, await convertedResponse.text()); const convertedBook = (await convertedResponse.json()).book; bookIds.push(convertedBook.id); assert.equal(convertedBook.originalRetained, false); assert.equal(convertedBook.locatorKind, "converted-text"); assert.equal(convertedBook.pageCount, null);
    assert.equal((await api.get(`/api/books/${convertedBook.id}/original`)).status(), 410);
    const retainedText = await api.get(`/api/books/${convertedBook.id}/text`); assert.equal(retainedText.status(), 200); assert.equal(createHash("sha256").update(await retainedText.body()).digest("hex"), convertedBook.retainedSha256);
    assert.ok([404, 410].includes((await api.get(`/api/books/${convertedBook.id}/pages/2`)).status()));
    const retainedSearch = await api.post("/api/books/search", { headers, data: { query: "pago", bookIds: [convertedBook.id] } }); assert.equal(retainedSearch.status(), 200, await retainedSearch.text()); const retainedCitation = (await retainedSearch.json()).results[0]; assert.equal(retainedCitation.verificationBasis, "retained_text"); assert.equal(retainedCitation.pageNumber, null);
    const retainedDraftResponse = await api.post("/api/books/drafts", { headers, data: { requestId: randomUUID(), title: "Escrito ficticio convertido", query: "pago", instruction: "Reunir el pasaje ficticio", bookIds: [convertedBook.id], mode: "extractive" } }); assert.equal(retainedDraftResponse.status(), 201, await retainedDraftResponse.text()); const retainedDraft = (await retainedDraftResponse.json()).draft;
    const retainedExport = await api.get(`/api/books/drafts/${retainedDraft.id}/export?format=txt`); assert.equal(retainedExport.status(), 200); assert.match(await retainedExport.text(), /texto conservado/i);
    assert.equal((await member.get(`/api/books/${textId}`)).status(), 404); assert.equal((await portal.get("/api/books")).status(), 403);
    for (const layout of ["mesa", "estantes", "gabinete", "galeria", "archivo", "salon"]) { const saved = await api.patch("/api/books/preferences", { headers, data: { libraryName: "Biblioteca ficticia", shelfTheme: "walnut", view: "covers", layout } }); assert.equal(saved.status(), 200, await saved.text()); assert.equal((await (await api.get("/api/books/preferences")).json()).preferences.layout, layout); }
    const epub = await (await api.get(`/api/books/${bookIds[1]}`)).json(); assert.equal(epub.book.locatorKind, "epub-section"); assert.equal(epub.fragments[0].pageNumber, null); assert.match(epub.fragments[0].text, /buena fe/);
    const pdf = await (await api.get(`/api/books/${pdfId}?page=2`)).json(); assert.equal(pdf.fragments[0].pageNumber, 2); assert.equal((await api.get(`/api/books/${pdfId}/pages/2`)).status(), 200);
    const proof = await api.post("/api/books/citations/verify", { headers, data: { citation: { bookId: pdfId, fragmentId: pdf.fragments[0].id, quote: pdf.fragments[0].text } } }); assert.equal(proof.status(), 200, await proof.text()); assert.equal((await proof.json()).citation.pageNumber, 2);
    const collectionResponse = await api.post("/api/books/collections", { headers, data: { name: "Colección compartida ficticia" } }); assert.equal(collectionResponse.status(), 201); let collection = (await collectionResponse.json()).collection;
    const share = await api.patch(`/api/books/collections/${collection.id}`, { headers, data: { revision: collection.revision, bookIds: [textId], memberIds: [users[1]] } }); assert.equal(share.status(), 200); collection = (await share.json()).collection;
    assert.equal((await member.get(`/api/books/${textId}`)).status(), 200); assert.equal((await member.patch(`/api/books/${textId}`, { headers: memberHeaders, data: { revision: 1, title: "Cambio no autorizado" } })).status(), 404);
    await db.integrationConfig.create({ data: { provider: "llm", enabled: true, configJson: JSON.stringify({ preset: "custom", apiUrl: `http://127.0.0.1:${modelPort}/v1`, model: "fictional-test-model", apiKey: "", allowDemo: false, requireApproval: true }) } });
    providerCreated = true;
    const input = { requestId: randomUUID(), title: "Escrito ficticio con citas", query: "buena fe contrato", instruction: "Contrastar los pasajes conservados", existingText: "Texto previo del profesional, ficticio.", collectionIds: [collection.id], mode: "ai" };
    const created = await member.post("/api/books/drafts", { headers: memberHeaders, data: input }); assert.equal(created.status(), 201, await created.text()); const draft = (await created.json()).draft; assert.equal(draft.modelUsed, true); assert.equal(calls, 1); assert.match(draft.body, /Texto previo del profesional/); assert.match(draft.body, /Pasaje literal corroborado/);
    const exported = await member.get(`/api/books/drafts/${draft.id}/export?format=txt`); assert.equal(exported.status(), 200); assert.match(await exported.text(), /Original SHA-256:/);
    const stale = await member.patch(`/api/books/drafts/${draft.id}`, { headers: memberHeaders, data: { expectedRevision: 9, title: draft.title, body: "No debe sobrescribir" } }); assert.equal(stale.status(), 409);
    invalidModel = true; assert.equal((await member.post("/api/books/drafts", { headers: memberHeaders, data: { ...input, requestId: randomUUID() } })).status(), 409); assert.equal(calls, 2);
    const abstained = await member.post("/api/books/drafts", { headers: memberHeaders, data: { ...input, requestId: randomUUID(), query: "terminoinexistenteficticio" } }); assert.equal(abstained.status(), 200); assert.equal((await abstained.json()).status, "abstained"); assert.equal(calls, 2);
    assert.equal((await api.post("/api/books/search", { headers: { Origin: base }, data: { query: "contrato", bookIds: [textId] } })).status(), 403);
    const state = await api.storageState(), cookie = state.cookies.map(c => `${c.name}=${c.value}`).join("; ");
    for (const route of ["/api/books/search", "/api/books/citations/verify", "/api/books/drafts"]) { const bytes = new TextEncoder().encode(JSON.stringify({ padding: "x".repeat(300_000) })), body = new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }); const response: Response = await fetch(`${base}${route}`, { method: "POST", headers: { ...headers, Cookie: cookie, "Content-Type": "application/json" }, body, duplex: "half" } as RequestInit & { duplex: "half" }); assert.equal(response.status, 413, route); }
    assert.equal((await api.patch(`/api/books/collections/${collection.id}`, { headers, data: { revision: collection.revision, memberIds: [] } })).status(), 200);
    for (const route of [`/api/books/${textId}`, `/api/books/${textId}/original`, `/api/books/drafts/${draft.id}`, `/api/books/drafts/${draft.id}/export?format=txt`]) assert.equal((await member.get(route)).status(), 404, route);
    console.log(JSON.stringify({ mode: "production", formats: ["txt", "epub", "docx", "pdf"], physicalPdfPage: 2, layouts: 6, optionalTextConversion: { originalRetained: false, original410: true, retainedTextHashVerified: true, pdfImageDenied: true, citationBasis: "retained_text", truthfulDraftExport: true }, ai: "loopback fixture via actual configured askLlm HTTP transport", modelCalls: calls, inventedQuoteRejected: true, zeroResultsNoModel: true, normalCsrf: true, chunkedJson413: 3, privateAndSharedReadonly: true, revokedDerivatives404: true, deployed: false }));
  } finally {
    for (const book of await db.libraryBook.findMany({ where: { ownerId: { in: users } }, select: { storageKey: true } })) keys.push(book.storageKey);
    await api.dispose(); await member.dispose(); await portal.dispose(); await db.auditEvent.deleteMany({ where: { actorId: { in: users } } }); await db.user.deleteMany({ where: { id: { in: users } } });
    if (providerCreated) await db.integrationConfig.deleteMany({ where: { provider: "llm" } }); if (orgId) await db.organization.deleteMany({ where: { id: orgId } });
    await Promise.all(keys.map(key => rm(path.join(process.env.STORAGE_PATH!, key), { force: true }))); await db.$disconnect(); await new Promise<void>(resolve => model.close(() => resolve()));
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
