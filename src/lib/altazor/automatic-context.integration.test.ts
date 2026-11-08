/** Disposable PostgreSQL, fictitious originals and model. No provider or user account. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { bookMetadataSchema } from "@/lib/books/ingest";
import { importBook } from "@/lib/books/service";
import { sha256 } from "@/lib/evidence/fragments";
import { automaticAltazorSources } from "./automatic-context";
import { prepareAltazorConversation } from "./prepare-conversation";
import { createAltazorConversation, createAltazorTurn, executeAltazorTurn, patchAltazorConversation, readAltazorConversation } from "./conversations";
import type { AltazorDestination, AltazorServiceOptions } from "./types";

const status = (value: number) => (error: unknown) => (error as { status?: number }).status === value;
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(url, new URL(process.env.DATABASE_URL!).toString());
  if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw Error("Requires local fictitious storage");
  const storage = await mkdtemp(path.join(tmpdir(), "lexopen-auto-context-")), priorStorage = process.env.STORAGE_PATH;
  process.env.STORAGE_PATH = storage;
  const db = new PrismaClient({ datasources: { db: { url } } }), tag = randomUUID(), users: string[] = [], cases: string[] = [];
  const originalFetch = globalThis.fetch; let network = 0;
  globalThis.fetch = (async () => { network++; throw Error("No remote provider permitted in fixture"); }) as typeof fetch;
  const destination: AltazorDestination = { provider: "fixture", model: "fixture", endpoint: "Local ficticio", endpointHash: sha256("fixture"), remote: false, permitted: true, key: sha256("fixture") };
  const answer = (message: string) => ({ planId: null, previewSteps: [], autoResults: [{ toolId: "respuesta.libre" as const, result: { ok: true, message } }], streamEvents: [], classification: { source: "rule" as const, toolIds: ["respuesta.libre"], prompt: "fixture" } });
  const options: AltazorServiceOptions = { destination: async () => destination, memory: async () => ({ context: "", dependencies: [], limited: false }), execute: async () => answer("Respuesta ficticia") };
  try {
    const owner = await db.user.create({ data: { email: `${tag}@auto-context.invalid`, name: "Titular ficticio", role: "abogado", password: "not-a-login" } }); users.push(owner.id);
    const stranger = await db.user.create({ data: { email: `${tag}-other@auto-context.invalid`, name: "Otro ficticio", role: "abogado", password: "not-a-login" } }); users.push(stranger.id);
    const createCase = async (rit: string, tribunal: string, abogadoId = owner.id) => { const cause = await db.causa.create({ data: { titulo: `Expediente ficticio ${tag}`, rit, tribunal, materia: "civil", acceso: "equipo", abogadoId } }); cases.push(cause.id); return cause; };
    const first = await createCase("C-7821-2026", "Primer Tribunal Ficticio"), duplicate = await createCase("C-7821-2026", "Segundo Tribunal Ficticio"), hidden = await createCase("C-9123-2026", "Tribunal reservado ficticio", stranger.id);
    const international = await createCase("CASE-2026-1152", "Commercial Court Fictitious"), internationalSlash = await createCase("2026/CV/00123", "District Court Fictitious"), hiddenInternational = await createCase("SECRET-2026-1152", "Private Court Fictitious", stranger.id);
    const dotted = await createCase("12345-2026", "Tribunal ROL ficticio"), suffix = await createCase("345-2026", "Otro ROL ficticio");
    const prepare = (input: Record<string, unknown>) => prepareAltazorConversation({ requestId: randomUUID(), ...input }, owner, db);
    const before = await db.altazorConversation.count({ where: { ownerId: owner.id } });
    assert.ok("clarify" in await prepare({ text: "Prepara la causa C-7821-2026" }));
    assert.equal(await db.altazorConversation.count({ where: { ownerId: owner.id } }), before, "ambiguity never creates a conversation");
    assert.ok("clarify" in await prepare({ text: "Prepara C-9123-2026" }));
    for (const cause of [international, internationalSlash]) {
      const result = await prepare({ text: `Resume el expediente ${cause.rit}.` });
      assert.ok("conversation" in result); assert.equal(result.conversation!.causaId, cause.id, "international references match as complete tokens");
    }
    const deniedReference = await prepare({ text: `Resume el expediente ${hiddenInternational.rit}.` });
    assert.ok(!("conversation" in deniedReference) || deniedReference.conversation?.causaId !== hiddenInternational.id, "a foreign reference never grants access");
    const partialReference = await prepare({ text: "Resume un expediente PREFIX-CASE-2026-1152." });
    assert.ok(!("conversation" in partialReference) || partialReference.conversation?.causaId !== international.id, "a suffix is not an exact international reference");
    const dottedResult = await prepare({ text: "Resume el ROL 12.345-2026." });
    assert.ok("conversation" in dottedResult); assert.equal(dottedResult.conversation!.causaId, dotted.id); assert.notEqual(dottedResult.conversation!.causaId, suffix.id);
    await createCase("12345-2026", "Tribunal ROL alternativo ficticio");
    const dottedWithCourt = await prepare({ text: "Resume el ROL 12.345-2026 del Tribunal ROL ficticio." });
    assert.ok("conversation" in dottedWithCourt); assert.equal(dottedWithCourt.conversation!.causaId, dotted.id, "aliases are one identifier and the court disambiguates it");
    await assert.rejects(prepare({ routeCausaId: hidden.id, text: "Resume esta causa" }), status(404));
    const preparations = await Promise.allSettled([
      prepare({ text: "Prepara C-7821-2026 del Primer Tribunal Ficticio", routeCausaId: duplicate.id }),
      prepare({ text: "Resume esta causa", routeCausaId: first.id }),
    ]);
    // Drain both operations before cleanup, even if one fails. An in-flight
    // retry must not recreate a conversation after the fixtures were deleted.
    const failure = preparations.find(result => result.status === "rejected");
    if (failure?.status === "rejected") throw failure.reason;
    const [selected, concurrent] = preparations.map(result => {
      assert.equal(result.status, "fulfilled");
      return result.value;
    });
    assert.ok("conversation" in selected); assert.equal(selected.conversation!.causaId, first.id, "unambiguous text takes precedence over page context");
    assert.ok("conversation" in concurrent); assert.equal(concurrent.conversation!.id, selected.conversation!.id, "concurrent preparations converge within a scope");
    assert.equal(await db.altazorConversation.count({ where: { ownerId: owner.id, causaId: first.id } }), 1);
    const contendedCase = await createCase("LOAD-2026-001", "Concurrent preparation fixture");
    const burst = await Promise.allSettled(Array.from({ length: 12 }, () => prepare({ text: "Resume esta causa", routeCausaId: contendedCase.id })));
    for (const result of burst) {
      if (result.status === "rejected") throw result.reason;
      assert.ok("conversation" in result.value);
      assert.equal(result.value.conversation!.causaId, contendedCase.id);
    }
    assert.equal(new Set(burst.map(result => result.status === "fulfilled" && result.value.conversation!.id)).size, 1, "a contended burst reuses one private conversation");
    assert.equal(await db.altazorConversation.count({ where: { ownerId: owner.id, causaId: contendedCase.id } }), 1);
    const alternate = (await createAltazorConversation({ requestId: randomUUID(), title: "Conversación explícita", causaId: first.id }, owner, db)).conversation;
    assert.notEqual(alternate.id, selected.conversation!.id, "the explicit creation API keeps separate conversations");
    await patchAltazorConversation(alternate.id, { status: "archived", expectedRevision: alternate.revision }, owner, db);
    const personal = (await createAltazorConversation({ requestId: randomUUID(), title: "Conversación personal" }, owner, db)).conversation;
    const personalCount = await db.altazorConversation.count({ where: { ownerId: owner.id, causaId: null } });
    const personalPrepared = await prepare({ text: "Hola" });
    assert.ok("conversation" in personalPrepared); assert.equal(personalPrepared.conversation!.id, personal.id);
    assert.equal(await db.altazorConversation.count({ where: { ownerId: owner.id, causaId: null } }), personalCount);
    assert.ok("clarify" in await prepare({ conversationId: personal.id, routeCausaId: first.id, hasPendingAttachments: true, text: "Resume esta causa" }));
    assert.equal((await db.altazorConversation.findUniqueOrThrow({ where: { id: personal.id } })).causaId, null, "scope and pending originals are never moved");
    const routed = await prepare({ conversationId: personal.id, routeCausaId: first.id, text: "Resume esta causa" });
    assert.ok("conversation" in routed); assert.equal(routed.conversation!.id, selected.conversation!.id, "route switch resumes the active case conversation and skips archived ones");
    await assert.rejects(prepareAltazorConversation({ requestId: randomUUID(), conversationId: personal.id, text: "Hola" }, stranger, db), status(404));
    const documentText = "Nebulosa conserva la comprobación ficticia del pago y sus antecedentes.";
    const doc = await db.documento.create({ data: { nombre: "nebula.txt", contenido: documentText, extractedMarkdown: documentText, extractionStatus: "completed", causaId: first.id, autorId: owner.id } });
    assert.equal(await db.documentEvidenceVersion.count({ where: { resource: { documentoId: doc.id } } }), 0);
    const otherDoc = await db.documento.create({ data: { nombre: "otra-causa.txt", contenido: "Nebulosa NO_MEZCLAR_OTRA_CAUSA", causaId: duplicate.id, autorId: owner.id } });
    for (const text of ["Analiza esta causa", "Resume los documentos de esta causa", "Revisa los antecedentes"]) {
      const overview = await automaticAltazorSources(owner, { causaId: first.id, text }, db);
      assert.ok(overview.some(input => input.kind === "document" && input.quote.includes("Nebulosa")), text);
      assert.ok(overview.length <= 3); assert.ok(!JSON.stringify(overview).includes("NO_MEZCLAR_OTRA_CAUSA"));
    }
    assert.deepEqual(await automaticAltazorSources(owner, { causaId: first.id, text: "Hola" }, db), [], "greetings do not load case documents");
    assert.equal(await db.documentEvidenceVersion.count({ where: { resource: { documentoId: doc.id } } }), 1, "natural case request prepares an unprepared original through the domain service");
    const unprepared = await db.documento.create({ data: { nombre: "nuevo.txt", contenido: "Nuevo antecedente conservado e íntegro.", extractedMarkdown: "Nuevo antecedente conservado e íntegro.", extractionStatus: "completed", causaId: first.id, autorId: owner.id } });
    assert.ok((await automaticAltazorSources(owner, { causaId: first.id, text: "Resume este documento", documentoId: unprepared.id }, db)).length);
    const pending = await db.documento.create({ data: { nombre: "pendiente.txt", extractionStatus: "pending", causaId: first.id, autorId: owner.id } });
    await assert.rejects(automaticAltazorSources(owner, { causaId: first.id, text: "Resume este documento", documentoId: pending.id }, db), error => status(409)(error) && /procesamiento/.test(String((error as Error).message)));
    const auto = await automaticAltazorSources(owner, { causaId: first.id, text: "Comprueba el pago Nebulosa" }, db);
    assert.ok(auto.some(input => input.kind === "document" && input.quote.includes("Nebulosa")));
    assert.ok(!JSON.stringify(auto).includes("NO_MEZCLAR_OTRA_CAUSA"));
    await assert.rejects(automaticAltazorSources(owner, { causaId: first.id, text: "Resume", documentoId: otherDoc.id }, db), status(404));
    const hint = await prepare({ conversationId: personal.id, documentoId: doc.id, text: "Resume este documento" });
    assert.ok("conversation" in hint); assert.equal(hint.conversation!.causaId, first.id);
    const book = (await importBook({ ...bookMetadataSchema.parse({ title: "Pauta Nebulosa ficticia" }), requestId: randomUUID(), name: "nebula.txt", bytes: Buffer.from("La pauta Nebulosa conserva un respaldo documental ficticio para la prueba.") }, owner, db)).book;
    await importBook({ ...bookMetadataSchema.parse({ title: "Libro ajeno" }), requestId: randomUUID(), name: "ajeno.txt", bytes: Buffer.from("Nebulosa NO_LEER_LIBRO_AJENO") }, stranger, db);
    const library = await automaticAltazorSources(owner, { causaId: null, text: "Pauta Nebulosa" }, db);
    assert.ok(library.some(input => input.kind === "book" && input.bookId === book.id));
    assert.ok(!JSON.stringify(library).includes("NO_LEER_LIBRO_AJENO"));
    async function turn(chatId: string, text: string, opts = options, automaticSources = false) {
      const conversation = await db.altazorConversation.findUniqueOrThrow({ where: { id: chatId } });
      const queued = await createAltazorTurn(chatId, { requestId: randomUUID(), text, automaticSources, useMemory: true, expectedRevision: conversation.revision, destinationKey: destination.key }, owner, db, opts);
      const result = await executeAltazorTurn(chatId, queued.turnId, owner, db, opts); assert.equal(result.turns.at(-1)?.status, "completed"); return queued.turnId;
    }
    const old = await turn(personal.id, "Guarda la pauta NÉBÚLÓSA", { ...options, execute: async input => { assert.ok(input.validatedReferences?.length); return answer("Acordamos utilizar la pauta NÉBÚLÓSA [R1]."); } }, true);
    for (let index = 0; index < 7; index++) await turn(personal.id, `Intercambio auxiliar ${index}`);
    const priorTurn = await db.altazorTurn.findUniqueOrThrow({ where: { id: old } });
    const archiveFixture = (await createAltazorConversation({ requestId: randomUUID(), title: "Intercambios auxiliares" }, owner, db)).conversation.id;
    const outsiderChat = (await createAltazorConversation({ requestId: randomUUID(), title: "Conversación ajena" }, stranger, db)).conversation.id;
    const historicalTurn = { inputSha256: sha256("auxiliar"), status: "completed", contextJson: JSON.stringify({ version: 1, attachmentIds: [], refs: [], historyTurnIds: [], memoryDependencies: [] }), createdAt: new Date(priorTurn.createdAt.getTime() + 1) };
    await db.altazorTurn.createMany({ data: Array.from({ length: 101 }, (_, index) => ({ ...historicalTurn, conversationId: archiveFixture, ownerId: owner.id, requestId: randomUUID(), ordinal: index + 1, userText: "Intercambio auxiliar", assistantText: "Contexto auxiliar" })) });
    await db.altazorTurn.create({ data: { ...historicalTurn, conversationId: outsiderChat, ownerId: stranger.id, requestId: randomUUID(), ordinal: 1, userText: "Nebulosa", assistantText: "NO_RECORDAR_OTRO_USUARIO" } });
    const foreignScope = (await createAltazorConversation({ requestId: randomUUID(), title: "Otro ámbito", causaId: duplicate.id }, owner, db)).conversation.id;
    await turn(foreignScope, "Pauta Nebulosa DATO_PRIVADO_OTRO_AMBITO", { ...options, execute: async () => answer("NO_RECORDAR_OTRA_CAUSA") });
    const newChat = (await createAltazorConversation({ requestId: randomUUID(), title: "Continuación personal" }, owner, db)).conversation.id;
    let recalledContext = "";
    const recalled = await turn(newChat, "¿Puedes recordar Nebulosa?", { ...options, execute: async input => {
      recalledContext = input.context || "";
      return answer("Recuerdo ficticio disponible");
    } });
    assert.match(recalledContext, /Acordamos utilizar la pauta NÉBÚLÓSA/);
    assert.doesNotMatch(recalledContext, /NO_RECORDAR_OTRA_CAUSA|DATO_PRIVADO_OTRO_AMBITO|NO_RECORDAR_OTRO_USUARIO/);
    assert.ok(!recalledContext.includes("[R1]"), "historical reference numbers are not promoted to current verified citations");
    const snapshot = JSON.parse((await db.altazorTurn.findUniqueOrThrow({ where: { id: recalled } })).contextJson);
    assert.ok(snapshot.recalledTurns.some((reference: { id: string }) => reference.id === old)); assert.ok(snapshot.recalledTurns.length <= 2);
    await db.libraryBook.update({ where: { id: book.id }, data: { deletedAt: new Date() } });
    assert.equal((await readAltazorConversation(newChat, owner, db, {}, options)).turns.at(-1)?.status, "blocked", "revoked source redacts the derived recall too");
    assert.equal(network, 0);
    console.log("Automatic companion context passed: RIT ambiguity, current owner and case ACL, page/document inference, pending attachments preserved, bounded original-verified RAG, private same-scope recall beyond recent messages, historical-citation separation and derived-source revocation; no network/model.");
  } finally {
    globalThis.fetch = originalFetch;
    await db.altazorConversation.deleteMany({ where: { ownerId: { in: users } } });
    await db.documento.deleteMany({ where: { causaId: { in: cases } } });
    await db.causa.deleteMany({ where: { id: { in: cases } } });
    await db.auditEvent.deleteMany({ where: { actorId: { in: users } } }); await db.commandExecution.deleteMany({ where: { ownerId: { in: users } } });
    await db.user.deleteMany({ where: { id: { in: users } } }); await db.$disconnect();
    if (priorStorage === undefined) delete process.env.STORAGE_PATH; else process.env.STORAGE_PATH = priorStorage;
    await rm(storage, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
