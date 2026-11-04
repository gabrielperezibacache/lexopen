/** Synthetic PostgreSQL/storage/optional HTTP. Never calls a model or external service. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { request, type APIRequestContext } from "@playwright/test";
import { prisma } from "@/lib/db";
import { hashPassword } from "@/lib/auth/password";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { sha256 } from "@/lib/evidence/fragments";
import { captureDocumentEvidence } from "@/lib/evidence/service";
import { putObject } from "@/lib/storage";
import { createAltazorMemoryNode, createAltazorMemoryEdge, updateAltazorMemory, readAltazorMemory, getAltazorMemoryContext, assertAltazorMemoryDependencies } from "./memory";
const code = (status: number) => (error: unknown) => (error as { status?: number }).status === status;
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(new URL(process.env.DATABASE_URL!).toString(), url);
  const tag = `memory-${randomUUID()}`, ids = [`${tag}-owner`, `${tag}-other`], password = "synthetic-memory-password";
  const root = await mkdtemp(path.join(os.tmpdir(), "lexopen-memory-fixture-")), previousStorage = process.env.STORAGE_PATH, previousFetch = globalThis.fetch;
  process.env.STORAGE_PATH = root; globalThis.fetch = (async () => { throw new Error("Memory fixture forbids model/provider egress"); }) as typeof fetch;
  const contexts: APIRequestContext[] = []; let causeId: string | null = null;
  try {
    const hashed = await hashPassword(password);
    const owner = await prisma.user.create({ data: { id: ids[0], email: `${ids[0]}@example.invalid`, name: "Synthetic memory owner", role: "abogado", password: hashed } });
    const other = await prisma.user.create({ data: { id: ids[1], email: `${ids[1]}@example.invalid`, name: "Synthetic memory other", role: "abogado", password: hashed } });
    const firstInput = { requestId: randomUUID(), expectedEpoch: 1, kind: "preference" as const, label: "Redacción clara", body: "Prefiero párrafos breves", supports: [{ kind: "manual" as const }] };
    const pair = await Promise.all([createAltazorMemoryNode(owner, firstInput), createAltazorMemoryNode(owner, firstInput)]); assert.equal(pair[0].id, pair[1].id);
    const first = pair[0], second = await createAltazorMemoryNode(owner, { ...firstInput, requestId: randomUUID(), label: "Claridad de documentos", body: "Revisar cada referencia" });
    assert.equal((await getAltazorMemoryContext(owner, { query: "redacción claridad" })).context, "", "Proposals never enter LLM context");
    const confirm = async (id: string, target: "node" | "edge" = "node", causaId?: string) => updateAltazorMemory(owner, id, { requestId: randomUUID(), causaId, target, expectedRevision: 1, action: "confirm" });
    await confirm(first.id); await confirm(second.id);
    const edge = await createAltazorMemoryEdge(owner, { requestId: randomUUID(), expectedEpoch: 1, fromId: first.id, toId: second.id, relation: "orienta", supports: [{ kind: "manual" }] }); await confirm(edge.id, "edge");
    const context = await getAltazorMemoryContext(owner, { query: "redacción claridad" }); assert.ok(context.context.includes(firstInput.label)); assert.ok(context.context.length <= 6000); assert.equal(context.dependencies.length, 3);
    await assertAltazorMemoryDependencies(owner, context.dependencies);
    await assert.rejects(assertAltazorMemoryDependencies(other, context.dependencies), code(409));
    assert.equal((await readAltazorMemory(other)).nodes.length, 0);
    await assert.rejects(updateAltazorMemory(other, first.id, { requestId: randomUUID(), target: "node", expectedRevision: 2, action: "confirm" }), code(404));
    await assert.rejects(createAltazorMemoryNode(owner, { ...firstInput, requestId: randomUUID(), kind: "claim" }), code(400));
    await updateAltazorMemory(owner, first.id, { requestId: randomUUID(), target: "node", expectedRevision: 2, action: "edit", label: "Redacción clara revisada", body: "Ahora prefiero una síntesis inicial" });
    await assert.rejects(assertAltazorMemoryDependencies(owner, context.dependencies), code(409));
    await updateAltazorMemory(owner, first.id, { requestId: randomUUID(), target: "node", expectedRevision: 3, action: "confirm" });
    const beforeForget = await getAltazorMemoryContext(owner, { query: "redacción claridad" });
    const forgotten = await updateAltazorMemory(owner, first.id, { requestId: randomUUID(), target: "node", expectedRevision: 4, action: "forget" }); assert.equal(forgotten.status, "forgotten");
    await assert.rejects(assertAltazorMemoryDependencies(owner, beforeForget.dependencies), code(409));
    const wiped = await prisma.altazorMemoryNode.findUniqueOrThrow({ where: { id: first.id } }); assert.equal(wiped.label, ""); assert.equal(wiped.body, ""); assert.equal(wiped.status, "forgotten");
    const wipedEdge = await prisma.altazorMemoryEdge.findUniqueOrThrow({ where: { id: edge.id } }); assert.equal(wipedEdge.relation, ""); assert.equal(wipedEdge.status, "forgotten");
    assert.equal(await prisma.altazorMemorySupport.count({ where: { OR: [{ nodeId: first.id }, { edgeId: edge.id }] } }), 0);
    await assert.rejects(createAltazorMemoryNode(owner, { ...firstInput, requestId: randomUUID() }), code(409), "Prepared epoch cannot commit after forget");
    await assert.rejects(createAltazorMemoryNode(owner, { ...firstInput, requestId: randomUUID(), expectedEpoch: 2, label: "Redacción clara revisada", body: "Ahora prefiero una síntesis inicial" }), code(409), "A tombstone cannot be silently resurrected under a new request");

    const bookText = "Material académico ficticio para análisis de evidencia y método. No es una obra real.", bookKey = `memory-fixture/${tag}/book.txt`;
    await putObject({ key: bookKey, body: Buffer.from(bookText), contentType: "text/plain" });
    const book = await prisma.libraryBook.create({ data: { ownerId: owner.id, requestId: randomUUID(), title: "Synthetic memory book", sourceName: "book.txt", mimeType: "text/plain", storageKey: bookKey, sourceSha256: sha256(bookText), textSha256: sha256(bookText), extractedText: bookText } });
    const fragment = await prisma.libraryBookFragment.create({ data: { bookId: book.id, ordinal: 1, text: bookText, textSha256: sha256(bookText), startOffset: 0, endOffset: bookText.length, locatorLabel: "Fragmento 1" } });
    const bookInput = { requestId: randomUUID(), expectedEpoch: 2, kind: "claim" as const, label: `PRIVATE_DERIVED_BOOK_${tag}`, body: "Interpretación privada que depende del respaldo", supports: [{ kind: "book" as const, bookId: book.id, fragmentId: fragment.id, quote: bookText }] };
    const bookNode = await createAltazorMemoryNode(owner, bookInput); await confirm(bookNode.id);
    const bookContext = await getAltazorMemoryContext(owner, { query: bookInput.label }); assert.ok(bookContext.context.includes(bookInput.label));
    await prisma.libraryBook.update({ where: { id: book.id }, data: { extractedText: "Tampered fixture" } });
    const hidden = await readAltazorMemory(owner); assert.ok(hidden.unavailable.some(node => node.id === bookNode.id)); assert.equal(JSON.stringify(hidden).includes(bookInput.label), false); assert.equal(JSON.stringify(hidden).includes(bookInput.body), false);
    await assert.rejects(assertAltazorMemoryDependencies(owner, bookContext.dependencies), code(409));
    assert.equal((await getAltazorMemoryContext(owner, { query: bookInput.label })).context, "");

    const cause = await prisma.causa.create({ data: { titulo: "Synthetic private memory case", tribunal: "Fixture", materia: "civil", acceso: "equipo", abogadoId: other.id, miembros: { create: { userId: owner.id, rol: "lectura" } } } }); causeId = cause.id;
    const document = await prisma.documento.create({ data: { causaId: causeId, nombre: "Memory evidence.txt", contenido: "Fuente ficticia privada del expediente para un recuerdo con respaldo." } });
    const version = await captureDocumentEvidence(document.id, owner), evidence = await prisma.documentEvidenceFragment.findFirstOrThrow({ where: { versionId: version.id } });
    const caseInput = { requestId: randomUUID(), expectedEpoch: 1, causaId: causeId, kind: "concept" as const, label: `PRIVATE_DERIVED_CASE_${tag}`, body: "Recuerdo de fuente reservada", supports: [{ kind: "evidence" as const, sourceKind: "document" as const, fragmentId: evidence.id, versionId: version.id, quote: evidence.text }] };
    const caseNode = await createAltazorMemoryNode(owner, caseInput); await confirm(caseNode.id, "node", causeId);
    await assert.rejects(createAltazorMemoryNode(owner, { ...caseInput, requestId: randomUUID(), causaId: null, expectedEpoch: 2 }), code(404));
    await assert.rejects(createAltazorMemoryEdge(owner, { requestId: randomUUID(), expectedEpoch: 2, fromId: second.id, toId: caseNode.id, relation: "cross scope", supports: [{ kind: "manual" }] }), code(404));
    const caseContext = await getAltazorMemoryContext(owner, { causaId: causeId, query: caseInput.label }); assert.ok(caseContext.context.includes(caseInput.label));
    await prisma.causaMiembro.deleteMany({ where: { causaId: causeId, userId: owner.id } });
    await assert.rejects(readAltazorMemory(owner, { causaId: causeId }), code(404));
    await assert.rejects(assertAltazorMemoryDependencies(owner, caseContext.dependencies, { causaId: causeId }), code(404));
    await updateAltazorMemory(owner, caseNode.id, { requestId: randomUUID(), causaId: causeId, target: "node", expectedRevision: 2, action: "forget" });
    assert.equal((await prisma.documento.findUniqueOrThrow({ where: { id: document.id } })).contenido, document.contenido, "Forget never deletes the underlying evidence");

    if (process.env.E2E_BASE_URL) {
      assert.equal(process.env.LEXOPEN_E2E, "1"); const base = new URL(process.env.E2E_BASE_URL); assert.ok(base.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) && !base.username && !base.password);
      const http = await request.newContext({ baseURL: base.origin, extraHTTPHeaders: { Origin: base.origin } }); contexts.push(http);
      assert.equal((await http.post("/api/auth/login", { data: { email: owner.email, password } })).status(), 200);
      const response = await http.get("/api/altazor/memory"); assert.equal(response.status(), 200); const visible = await response.json(); assert.equal(JSON.stringify(visible).includes(firstInput.body), false); assert.equal(JSON.stringify(visible).includes(bookInput.label), false);
      const post = await http.post("/api/altazor/memory", { data: { ...firstInput, requestId: randomUUID(), expectedEpoch: 2, label: "HTTP memory preference", body: "Fictitious HTTP preference" } }); assert.equal(post.status(), 201);
    }
    console.log(`Altazor memory PostgreSQL${contexts.length ? "+HTTP" : ""} passed: concurrent receipts, proposed/confirmed/edit, private scopes, book/evidence integrity, forgotten content+edges, epoch/tombstone non-resurrection, source retention and bounded verified context; no model/provider`);
  } finally {
    globalThis.fetch = previousFetch;
    for (const context of contexts) await context.dispose();
    await prisma.altazorMemorySpace.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.commandExecution.deleteMany({ where: { ownerId: { in: ids } } });
    await prisma.auditEvent.deleteMany({ where: { actorId: { in: ids } } });
    await prisma.libraryBook.deleteMany({ where: { ownerId: { in: ids } } });
    if (causeId) await prisma.causa.delete({ where: { id: causeId } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
    if (previousStorage === undefined) delete process.env.STORAGE_PATH; else process.env.STORAGE_PATH = previousStorage;
    await rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
