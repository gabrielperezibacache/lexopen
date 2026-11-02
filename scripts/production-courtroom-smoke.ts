import assert from "node:assert/strict";
import { randomUUID, createHash } from "node:crypto";
import { createServer } from "node:http";
import { rm } from "node:fs/promises";
import path from "node:path";
import { hash } from "bcryptjs";
import { request, type APIResponse } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "../src/lib/testing/disposable-db";

async function json(response: APIResponse, status = 200) {
  assert.equal(response.status(), status, await response.text());
  return response.json();
}
// One second of synthetic silence: verifies transport and provenance, not recognition accuracy.
function syntheticWav() {
  const bytes = Buffer.alloc(44 + 16_000); bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16_000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(16_000, 40); return bytes;
}
async function main() {
  assert.equal(process.env.NODE_ENV, "production"); assert.notEqual(process.env.LEXOPEN_E2E, "1"); assert.notEqual(process.env.LEXOPEN_RELAX_CSRF, "1");
  const base = process.env.PROD_TEST_BASE_URL!; assert.ok(base && ["127.0.0.1", "localhost"].includes(new URL(base).hostname));
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(url, process.env.DATABASE_URL); assert.ok(process.env.STORAGE_PATH);
  const keepFixtures = process.env.PROD_TEST_KEEP_FIXTURES === "1";
  const db = new PrismaClient({ datasources: { db: { url } } }), tag = randomUUID(), password = `Ficticio-${randomUUID()}`;
  const admin = await request.newContext({ baseURL: base }), professional = await request.newContext({ baseURL: base }), outsider = await request.newContext({ baseURL: base });
  const userIds: string[] = [], caseIds: string[] = [], keys: string[] = []; let organizationId = "", speechCalls = 0, modelCalls = 0, completed = false;
  const transcript = "Texto ficticio del proveedor de pruebas: se incorpora el documento del contrato para revisar su contenido.";
  const provider = createServer(async (req, res) => { try {
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk)); const body = Buffer.concat(chunks);
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/v1/audio/transcriptions") { speechCalls++; assert.match(req.headers["content-type"] || "", /multipart\/form-data/); assert.ok(body.includes(Buffer.from("WAVE"))); assert.ok(body.includes(Buffer.from("modelo-ficticio"))); res.end(JSON.stringify({ text: transcript, duration: 1, segments: [{ start: 0, end: 1, text: transcript }] })); }
    else if (req.url === "/v1/chat/completions") { modelCalls++; const payload = JSON.parse(body.toString()); assert.match(JSON.stringify(payload), /no confiables/i); res.end(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ paragraphs: [{ text: "El pasaje ficticio seleccionado ayuda a ordenar la revisión del contrato.", citationIds: ["S1"] }] }) } }] })); }
    else { res.statusCode = 404; res.end("{}"); }
    } catch (error) { res.statusCode = 500; res.end(JSON.stringify({ error: String(error) })); }
  });
  await new Promise<void>(resolve => provider.listen(0, "127.0.0.1", resolve)); const port = (provider.address() as { port: number }).port;
  try {
    assert.equal(await db.integrationConfig.count({ where: { provider: { in: ["llm", "transcription"] } } }), 0, "Use a fresh disposable database without configured providers");
    const organization = await db.organization.create({ data: { name: `Audiencias ficticias ${tag}`, settings: { create: { assistantLlmMode: "local_only", require2faPrivileged: false } } } }); organizationId = organization.id;
    for (const role of ["admin", "abogado", "abogado"]) { const user = await db.user.create({ data: { name: `Prueba ficticia ${role}`, email: `${randomUUID()}@courtroom.invalid`, role, password: await hash(password, 10) } }); userIds.push(user.id); }
    async function login(context: typeof admin, index: number) { const user = await db.user.findUniqueOrThrow({ where: { id: userIds[index] } }); await json(await context.post("/api/auth/login", { headers: { Origin: base }, data: { email: user.email, password } })); const token = (await context.storageState()).cookies.find(cookie => cookie.name === "lexopen_csrf")?.value; assert.ok(token); return { Origin: base, "x-csrf-token": token! }; }
    const adminHeaders = await login(admin, 0), headers = await login(professional, 1); await login(outsider, 2);
    for (const title of ["Causa ficticia para audiencia", "Otra causa ficticia"]) { const causa = await db.causa.create({ data: { titulo: title, tribunal: "Tribunal de pruebas ficticio", materia: "civil", acceso: "equipo", abogadoId: userIds[1] } }); caseIds.push(causa.id); }
    const root = `/api/causas/${caseIds[0]}`, otherRoot = `/api/causas/${caseIds[1]}`;
    const judicial = { court: "Tribunal ficticio de pruebas", chamber: "Sala ficticia", caseNumber: "FICTICIO-2026", decisionDate: "2026-11-01", caseTitle: "Ejemplo ficticio de contrato" };
    const judicialBytes = Buffer.from("Documento judicial ficticio, sin valor jurídico. El contrato debe revisarse conforme a los antecedentes y al pago acreditado en el expediente ficticio.");
    const imported = await json(await professional.post("/api/books", { headers, multipart: { requestId: randomUUID(), title: "Sentencia ficticia de pruebas", sourceType: "judgment", judicialJson: JSON.stringify(judicial), file: { name: "sentencia-ficticia.txt", mimeType: "text/plain", buffer: judicialBytes } } }), 201);
    assert.equal(imported.book.sourceType, "judgment"); assert.equal(imported.book.judicial.decisionDate, judicial.decisionDate);
    const read = await json(await professional.get(`/api/books/${imported.book.id}`)), fragment = read.fragments[0];
    const citation = (await json(await professional.post("/api/books/citations/verify", { headers, data: { citation: { bookId: imported.book.id, fragmentId: fragment.id, quote: fragment.text } } }))).citation;
    assert.equal(citation.sourceType, "judgment"); assert.equal(citation.pageNumber, null); assert.equal(citation.judicial.caseNumber, judicial.caseNumber);
    assert.equal((await outsider.get(`/api/books/${imported.book.id}`)).status(), 404);
    const wav = syntheticWav(), audioUpload = await json(await professional.post(`${root}/audios`, { headers, multipart: { requestId: randomUUID(), title: "Grabación ficticia de audiencia", file: { name: "audio-ficticio.wav", mimeType: "audio/wav", buffer: wav } } }), 201); let audio = audioUpload.audio;
    const audioRoot = `${root}/audios/${audio.id}`; assert.equal(audio.sourceSha256, createHash("sha256").update(wav).digest("hex"));
    const original = await professional.get(`${audioRoot}/original`); assert.deepEqual(await original.body(), wav); assert.match(original.headers()["cache-control"], /no-store/);
    const range = await professional.get(`${audioRoot}/original`, { headers: { Range: "bytes=0-43" } }); assert.equal(range.status(), 206); assert.deepEqual(await range.body(), wav.subarray(0, 44)); assert.equal((await professional.get(`${audioRoot}/original`, { headers: { Range: "bytes=999999-" } })).status(), 416);
    assert.equal((await professional.get(`${otherRoot}/audios/${audio.id}`)).status(), 404); assert.equal((await outsider.get(audioRoot)).status(), 404);
    assert.equal((await professional.post(`${audioRoot}/transcribe`, { headers, data: { revision: audio.revision } })).status(), 409); assert.equal(speechCalls, 0); audio = (await json(await professional.get(audioRoot))).audio;
    const configured = await json(await admin.post("/api/integrations/transcription", { headers: adminHeaders, data: { enabled: true, preset: "local", apiUrl: `http://127.0.0.1:${port}/v1`, model: "modelo-ficticio", responseFormat: "verbose_json", apiKey: "clave-ficticia" } }));
    assert.equal(configured.config.hasApiKey, true); assert.ok(!JSON.stringify(configured).includes("clave-ficticia"));
    assert.equal((await professional.get("/api/integrations/transcription")).status(), 403);
    audio = (await json(await professional.post(`${audioRoot}/transcribe`, { headers, data: { revision: audio.revision } }))).audio;
    assert.equal(audio.transcriptText, transcript); assert.equal(audio.reviewStatus, "unreviewed"); assert.equal(audio.segments[0].startMs, 0); assert.equal(speechCalls, 1);
    const pendingText = await professional.get(`${audioRoot}/transcript`); assert.match(await pendingText.text(), /AUTOMÁTICA SIN REVISIÓN HUMANA/);
    assert.equal((await professional.patch(audioRoot, { headers, data: { revision: 999, transcriptText: transcript, reviewed: true } })).status(), 409);
    audio = (await json(await professional.patch(audioRoot, { headers, data: { revision: audio.revision, transcriptText: `${transcript}\nNota corregida por el profesional ficticio.`, reviewed: true } }))).audio; assert.equal(audio.reviewStatus, "reviewed");
    const published = await json(await professional.post(`${audioRoot}/publish`, { headers, data: { revision: audio.revision } }), 201); audio = published.audio;
    assert.equal(published.document.causaId, caseIds[0]); assert.equal(published.document.ruta, "Audiencias/Transcripciones");
    const document = await db.documento.findUniqueOrThrow({ where: { id: published.document.id } }); assert.match(document.contenido || "", /REVISADA POR UNA PERSONA/); assert.match(document.contenido || "", /No acredita que el texto/);
    assert.ok((await json(await professional.get(audioRoot))).history.length >= 2);
    const hearing = await json(await professional.post(`${root}/hearings`, { headers, data: { title: "Preparación ficticia de audiencia" } }), 201), desk = `${root}/hearings/${hearing.id}`;
    const source = await json(await professional.post(`${desk}/sources`, { headers, data: { kind: "book", refId: imported.book.id } }));
    const reading = await json(await professional.get(`${desk}/sources/${source.id}/read`)); assert.equal(reading.fragments[0].text, fragment.text);
    const passage = { sourceId: source.id, fragmentId: fragment.id, quote: fragment.text };
    const note = await json(await professional.post(`${desk}/notes`, { headers, data: { title: "Nota ficticia sobre el contrato", body: "Contrastar este pasaje durante la audiencia ficticia.", citation: passage } }));
    const input = { requestId: randomUUID(), question: "Qué antecedente del contrato debo revisar", mode: "extractive", passages: [passage], noteIds: [note.id] };
    await json(await professional.post(`${desk}/chat`, { headers, data: input })); assert.equal(modelCalls, 0);
    await db.integrationConfig.create({ data: { provider: "llm", enabled: true, configJson: JSON.stringify({ preset: "custom", apiUrl: `http://127.0.0.1:${port}/v1`, model: "modelo-ficticio", apiKey: "", allowDemo: false }) } });
    const turn = await json(await professional.post(`${desk}/chat`, { headers, data: { ...input, requestId: randomUUID(), mode: "ai" } })); assert.equal(turn.turn.modelUsed, true); assert.equal(modelCalls, 1);
    assert.equal((await admin.get(desk)).status(), 404, "Even an administrator cannot read another professional's private desk");
    const exported = await professional.get(`${desk}/export`); assert.equal(exported.status(), 200); assert.match(await exported.text(), /Rol FICTICIO-2026/);
    assert.equal((await professional.post(`${desk}/notes`, { headers: { Origin: base }, data: { title: "No guardar", body: "Sin token", citation: null } })).status(), 403);
    await db.libraryBook.update({ where: { id: imported.book.id }, data: { deletedAt: new Date() } });
    const revoked = await json(await professional.get(desk)); assert.equal(revoked.notes[0].available, false); assert.ok(revoked.turns.every((value: { available: boolean }) => !value.available)); assert.ok(!JSON.stringify(revoked).includes("Contrastar este pasaje"));
    assert.equal((await professional.post(`${desk}/verify`, { headers, data: { turnId: turn.turn.id } })).status(), 404);
    if (keepFixtures) { await db.libraryBook.update({ where: { id: imported.book.id }, data: { deletedAt: null } }); console.log(JSON.stringify({ fixtureManifest: { userIds, caseIds, bookId: imported.book.id, audioId: audio.id, sourceDocumentId: audio.sourceDocumentId, transcriptDocumentId: document.id, workspaceId: hearing.id, sourceId: source.id, noteId: note.id, turnId: turn.turn.id, organizationId } })); }
    completed = true;
    console.log(JSON.stringify({ mode: "production", deployed: false, judicialMetadataAndReferences: true, audioOriginalAndRanges: true, speechTransport: "real HTTP to local fixture; recognition accuracy untested", speechCalls, manualReviewHistory: true, transcriptInCaseFolder: true, hearingNotesAndReader: true, modelCalls, aiTransport: "real configured askLlm HTTP to local fixture", normalCookiesAndCsrf: true, revokedDerivedContentHidden: true, privateDeskEvenForAdmin: true }));
  } finally {
    for (const book of await db.libraryBook.findMany({ where: { ownerId: { in: userIds } } })) keys.push(book.storageKey);
    for (const audio of await db.caseAudio.findMany({ where: { causaId: { in: caseIds } } })) keys.push(audio.storageKey);
    await Promise.all([admin.dispose(), professional.dispose(), outsider.dispose()]);
    if (!keepFixtures || !completed) {
    await db.hearingWorkspace.deleteMany({ where: { causaId: { in: caseIds } } }); await db.caseAudio.deleteMany({ where: { causaId: { in: caseIds } } }); await db.documento.deleteMany({ where: { causaId: { in: caseIds } } }); await db.causa.deleteMany({ where: { id: { in: caseIds } } }); await db.auditEvent.deleteMany({ where: { actorId: { in: userIds } } }); await db.user.deleteMany({ where: { id: { in: userIds } } });
    await db.integrationConfig.deleteMany({ where: { provider: { in: ["llm", "transcription"] } } }); if (organizationId) await db.organization.delete({ where: { id: organizationId } });
    await Promise.all(keys.map(key => rm(path.join(process.env.STORAGE_PATH!, key), { force: true })));
    }
    await db.$disconnect(); await new Promise<void>(resolve => provider.close(() => resolve()));
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
