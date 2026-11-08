import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServer } from "node:http";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { documentReadWhere } from "@/lib/auth/causa-access";
import { captureDocumentEvidence, readDocumentEvidence } from "@/lib/evidence/service";
import { sha256 } from "@/lib/evidence/fragments";
import { AUDIO_LEASE_MS, editCaseAudio, listCaseAudio, publishCaseAudio, readCaseAudio, readCaseAudioOriginal, transcribeCaseAudio, uploadCaseAudio } from "./service";
import { readTranscriptionConfig, saveTranscriptionConfig } from "./provider";

const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
function wave() { const bytes = Buffer.alloc(16044); bytes.write("RIFF"); bytes.writeUInt32LE(16036, 4); bytes.write("WAVE", 8); bytes.write("fmt ", 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(16000, 40); return bytes; }
async function files(root: string): Promise<string[]> { let entries; try { entries = await readdir(root, { withFileTypes: true }); } catch { return []; } return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(root, entry.name)) : [path.join(root, entry.name)]))).flat().sort(); }
function gate() { let resolve!: () => void; const promise = new Promise<void>(yes => { resolve = yes; }); return { promise, resolve }; }

async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(url, process.env.DATABASE_URL);
  if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw new Error("Requires local disposable storage");
  const root = await mkdtemp(path.join(tmpdir(), "lexopen-audio-test-")), previousStorage = process.env.STORAGE_PATH; process.env.STORAGE_PATH = root;
  const client = new PrismaClient({ datasources: { db: { url } } }), users: string[] = [], cases: string[] = [], sourceBytes = wave();
  const priorConfig = await client.integrationConfig.findUnique({ where: { provider: "transcription" } });
  const priorFirm = await client.firmSettings.findFirst(); let organizationId: string | undefined, firmId = priorFirm?.id || "", failAudit = false, providerCalls = 0;
  const guarded = client.$extends({ query: { auditEvent: { async create({ args, query }) { if (failAudit) throw new Error("Synthetic audit outage"); return query(args); } } } }) as unknown as PrismaClient;
  let mode: "ok" | "hold" | "invalid" | "oversize" | "error" = "ok", arrived = gate(), release = gate();
  const server = createServer(async (request, response) => {
    try {
      providerCalls++; assert.equal(request.method, "POST"); assert.equal(request.url, "/v1/audio/transcriptions");
      assert.equal(request.headers.authorization, "Bearer synthetic-api-key");
      const chunks: Buffer[] = []; for await (const chunk of request) chunks.push(Buffer.from(chunk));
      const form = await new Request("http://localhost/v1/audio/transcriptions", { method: "POST", headers: { "Content-Type": String(request.headers["content-type"]) }, body: Buffer.concat(chunks) }).formData();
      assert.equal(form.get("model"), "synthetic-whisper"); assert.equal(form.get("response_format"), "verbose_json"); const file = form.get("file"); assert.ok(file instanceof File); assert.deepEqual(Buffer.from(await file.arrayBuffer()), sourceBytes);
      if (mode === "hold") { arrived.resolve(); await release.promise; }
      if (mode === "error") { response.writeHead(500).end("synthetic provider error containing private content"); return; }
      if (mode === "oversize") { response.writeHead(200, { "Content-Type": "application/json" }); response.end("x".repeat(2 * 1024 * 1024 + 1)); return; }
      const text = "Esta declaración ficticia sólo prueba el transporte.";
      response.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ text, duration: 1, segments: [{ start: 0, end: mode === "invalid" ? 9 : 1, text }] }));
    } catch { response.writeHead(500).end("fixture assertion failed"); }
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address(); assert.ok(address && typeof address !== "string"); const localUrl = `http://127.0.0.1:${address.port}/v1`;
  try {
    if (!firmId) { const org = await client.organization.create({ data: { name: "Synthetic audio organization" } }); organizationId = org.id; firmId = (await client.firmSettings.create({ data: { organizationId: org.id, assistantLlmMode: "local_only" } })).id; }
    else await client.firmSettings.update({ where: { id: firmId }, data: { assistantLlmMode: "local_only" } });
    const actors = [];
    for (const role of ["abogado", "asistente", "admin", "cliente"]) { const user = await client.user.create({ data: { email: `${randomUUID()}@audio-fixture.invalid`, name: `Audio fixture ${role}`, role, password: "not-a-login" } }); users.push(user.id); actors.push(user); }
    const [owner, reader, admin, portal] = actors;
    for (const suffix of ["A", "B"]) { const cause = await client.causa.create({ data: { titulo: `Synthetic audio ${suffix}`, tribunal: "Tribunal ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id } }); cases.push(cause.id); }
    const causaId = cases[0]; await client.causaMiembro.create({ data: { causaId, userId: reader.id, rol: "lectura" } });
    const input = { requestId: randomUUID(), title: "Declaración ficticia", name: "synthetic.wav", bytes: sourceBytes };
    const concurrent = await Promise.all([uploadCaseAudio(causaId, input, owner, client), uploadCaseAudio(causaId, input, owner, client)]);
    assert.equal(concurrent[0].audio.id, concurrent[1].audio.id); assert.equal(concurrent.filter(value => value.reused).length, 1); const id = concurrent[0].audio.id;
    const row = await client.caseAudio.findUniqueOrThrow({ where: { id } }); assert.equal(await client.documento.count({ where: { causaId, tipo: "audio" } }), 1); assert.deepEqual(await files(root), [path.join(root, row.storageKey)]); assert.deepEqual(await readFile(path.join(root, row.storageKey)), sourceBytes);
    assert.match(row.storageKey, /\/attempts\/[a-f0-9-]{36}\/original\/[a-f0-9]{64}$/); assert.equal(row.sourceSha256, sha256(sourceBytes)); assert.equal(row.durationMs, 1000);
    assert.equal((await client.documento.findUniqueOrThrow({ where: { id: row.sourceDocumentId } })).ruta, "Audiencias/Grabaciones");
    await assert.rejects(uploadCaseAudio(causaId, { ...input, title: "Other payload" }, owner, client), status(409));
    await assert.rejects(readCaseAudio(cases[1], id, owner, client), status(404)); await assert.rejects(listCaseAudio(causaId, portal, client), status(403)); await assert.rejects(listCaseAudio(causaId, admin, client), status(404));
    await assert.rejects(editCaseAudio(causaId, id, { revision: 1, transcriptText: "No write", reviewed: false }, reader, client), status(403));
    assert.deepEqual((await readCaseAudioOriginal(causaId, id, owner, client)).bytes, sourceBytes);
    await writeFile(path.join(root, row.storageKey), "tampered original"); await assert.rejects(readCaseAudio(causaId, id, owner, client), status(409)); await assert.rejects(readCaseAudioOriginal(causaId, id, owner, client), status(409)); await writeFile(path.join(root, row.storageKey), sourceBytes);
    await assert.rejects(client.documento.update({ where: { id: row.sourceDocumentId }, data: { causaId: cases[1] } })); await assert.rejects(client.documento.update({ where: { id: row.sourceDocumentId }, data: { storageKey: "another-key" } })); await assert.rejects(client.caseAudio.update({ where: { id }, data: { sourceSha256: "0".repeat(64) } })); await assert.rejects(client.documento.delete({ where: { id: row.sourceDocumentId } }));
    // Audit failure rolls back both original document and audio and removes only this attempt.
    const countBefore = (await files(root)).length; failAudit = true; await assert.rejects(uploadCaseAudio(causaId, { ...input, requestId: randomUUID(), title: "Must rollback" }, owner, guarded), status(500)); failAudit = false; assert.equal(await client.caseAudio.count({ where: { causaId } }), 1); assert.equal((await files(root)).length, countBefore);
    await assert.rejects(readTranscriptionConfig(owner, client), status(403));
    const config = { enabled: true, preset: "local" as const, apiUrl: localUrl, model: "synthetic-whisper", responseFormat: "verbose_json" as const, apiKey: "synthetic-api-key" };
    const configured = await saveTranscriptionConfig(config, admin, client); assert.equal(configured.config.hasApiKey, true); assert.ok(!JSON.stringify(configured).includes("synthetic-api-key"));
    const storedConfig = await client.integrationConfig.findUniqueOrThrow({ where: { provider: "transcription" } }); assert.ok(!storedConfig.configJson.includes("synthetic-api-key")); assert.match(storedConfig.configJson, /enc:v2:/); assert.ok(!JSON.stringify(await readTranscriptionConfig(admin, client)).includes("enc:v2"));
    // Local-only denies a real configured public endpoint before any fetch/audio egress.
    await saveTranscriptionConfig({ ...config, preset: "openai", apiUrl: "https://api.openai.com/v1", model: "explicit-model", responseFormat: "json" }, admin, client);
    const originalFetch = globalThis.fetch; let unexpected = 0; globalThis.fetch = (async () => { unexpected++; throw new Error("Network must not run"); }) as typeof fetch;
    try { await assert.rejects(transcribeCaseAudio(causaId, id, { revision: 1 }, owner, client), status(403)); } finally { globalThis.fetch = originalFetch; }
    assert.equal(unexpected, 0); let current = (await readCaseAudio(causaId, id, owner, client)).audio; assert.equal(current.transcriptText, ""); assert.equal(current.status, "failed");
    await saveTranscriptionConfig(config, admin, client);
    // Persistent lease denies concurrent providers and edits while the real HTTP transport waits.
    mode = "hold"; arrived = gate(); release = gate(); const running = transcribeCaseAudio(causaId, id, { revision: current.revision }, owner, client); await arrived.promise;
    await assert.rejects(transcribeCaseAudio(causaId, id, { revision: current.revision }, owner, client), status(409)); await assert.rejects(editCaseAudio(causaId, id, { revision: current.revision, transcriptText: "Concurrent edit", reviewed: false }, owner, client), status(409));
    release.resolve(); const transcribed = await running; mode = "ok"; current = transcribed.audio; assert.equal(current.reviewStatus, "unreviewed"); assert.equal(current.provider, "local-whisper-compatible"); assert.equal(current.segments?.[0].endMs, 1000); assert.equal((await readCaseAudio(causaId, id, owner, client)).history.length, 1); assert.equal(providerCalls, 1);
    // Retrying an expired persisted job replaces only that lease and succeeds.
    await client.caseAudio.update({ where: { id }, data: { status: "transcribing", operationToken: "expired-fixture", operationLockedAt: new Date(Date.now() - AUDIO_LEASE_MS - 1000) } });
    current = (await transcribeCaseAudio(causaId, id, { revision: current.revision }, owner, client)).audio; assert.equal(providerCalls, 2);
    const review = await editCaseAudio(causaId, id, { revision: current.revision, transcriptText: current.transcriptText, reviewed: true }, owner, client); current = review.audio; assert.equal(current.reviewStatus, "reviewed"); assert.equal(current.segments?.length, 1);
    const race = await Promise.allSettled([editCaseAudio(causaId, id, { revision: current.revision, transcriptText: "Primera corrección ficticia.", reviewed: false }, owner, client), editCaseAudio(causaId, id, { revision: current.revision, transcriptText: "Segunda corrección ficticia.", reviewed: false }, owner, client)]); assert.equal(race.filter(value => value.status === "fulfilled").length, 1); assert.equal(race.filter(value => value.status === "rejected" && status(409)(value.reason)).length, 1);
    current = (await readCaseAudio(causaId, id, owner, client)).audio; assert.deepEqual(current.segments, []); assert.equal(current.provider, "manual");
    const pubRace = await Promise.allSettled([publishCaseAudio(causaId, id, { revision: current.revision }, owner, client), publishCaseAudio(causaId, id, { revision: current.revision }, owner, client)]); assert.equal(pubRace.filter(value => value.status === "fulfilled").length, 1);
    const first = pubRace.find(value => value.status === "fulfilled"); assert.ok(first && first.status === "fulfilled"); const firstDocument = await client.documento.findUniqueOrThrow({ where: { id: first.value.document.id } }); assert.match(firstDocument.contenido!, /MANUAL SIN REVISIÓN/); assert.equal(firstDocument.causaId, causaId); assert.equal(firstDocument.ruta, "Audiencias/Transcripciones"); assert.ok(firstDocument.contenido!.includes(row.sourceSha256));
    await client.documento.update({ where: { id: firstDocument.id }, data: { contenido: firstDocument.contenido + "\nAnotación posterior del usuario." } });
    current = (await readCaseAudio(causaId, id, owner, client)).audio;
    current = (await editCaseAudio(causaId, id, { revision: current.revision, transcriptText: "Tercera versión ficticia corroborada por una persona.", reviewed: true }, owner, client)).audio;
    const second = await publishCaseAudio(causaId, id, { revision: current.revision }, owner, client); assert.notEqual(second.document.id, firstDocument.id); assert.equal(await client.caseAudioPublication.count({ where: { audioId: id } }), 2); assert.match((await client.documento.findUniqueOrThrow({ where: { id: firstDocument.id } })).contenido!, /Anotación posterior del usuario/);
    assert.match((await client.documento.findUniqueOrThrow({ where: { id: second.document.id } })).contenido!, /REVISADA POR UNA PERSONA/); assert.equal(second.evidenceStatus, "not_indexed");
    for (const documentId of [firstDocument.id, second.document.id]) { await captureDocumentEvidence(documentId, owner, client); assert.ok((await readDocumentEvidence(documentId, reader, {}, client)).fragments.length > 0); }
    await client.documento.update({ where: { id: row.sourceDocumentId }, data: { confidencial: true } });
    await assert.rejects(readCaseAudio(causaId, id, reader, client), status(404)); assert.equal((await listCaseAudio(causaId, reader, client)).audios.length, 0);
    for (const documentId of [firstDocument.id, second.document.id]) { assert.equal(await client.documento.count({ where: { AND: [{ id: documentId }, documentReadWhere(reader)] } }), 0); await assert.rejects(readDocumentEvidence(documentId, reader, {}, client), status(404)); }
    await client.documento.update({ where: { id: row.sourceDocumentId }, data: { confidencial: false } });
    await client.caseAudio.update({ where: { id }, data: { deletedAt: new Date() } }); for (const documentId of [firstDocument.id, second.document.id]) await assert.rejects(readDocumentEvidence(documentId, owner, {}, client), status(404)); await client.caseAudio.update({ where: { id }, data: { deletedAt: null } });
    // Current role/ACL changes during provider work prevent committing returned private text.
    current = (await readCaseAudio(causaId, id, owner, client)).audio; const beforeText = current.transcriptText, historyBefore = (await readCaseAudio(causaId, id, owner, client)).history.length;
    mode = "hold"; arrived = gate(); release = gate(); const revoked = transcribeCaseAudio(causaId, id, { revision: current.revision }, owner, client); await arrived.promise;
    await client.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "assistant.use" } }); release.resolve(); await assert.rejects(revoked, status(403)); mode = "ok";
    await assert.rejects(readCaseAudio(causaId, id, owner, client), status(403)); await client.user.update({ where: { id: owner.id }, data: { capabilityRevokes: "" } });
    current = (await readCaseAudio(causaId, id, owner, client)).audio; assert.equal(current.transcriptText, beforeText); assert.equal((await readCaseAudio(causaId, id, owner, client)).history.length, historyBefore);
    // Invalid and oversized remote output is never persisted as new text or fabricated timings.
    for (const nextMode of ["invalid", "oversize", "error"] as const) { mode = nextMode; await assert.rejects(transcribeCaseAudio(causaId, id, { revision: current.revision }, owner, client)); current = (await readCaseAudio(causaId, id, owner, client)).audio; assert.equal(current.transcriptText, beforeText); assert.ok(!current.lastError?.includes("private content")); }
    mode = "ok";
    failAudit = true; await assert.rejects(editCaseAudio(causaId, id, { revision: current.revision, transcriptText: "Must roll back transcript", reviewed: true }, owner, guarded), status(500)); failAudit = false;
    assert.equal((await readCaseAudio(causaId, id, owner, client)).audio.transcriptText, beforeText);
    await saveTranscriptionConfig({ ...config, enabled: false }, admin, client); current = (await readCaseAudio(causaId, id, owner, client)).audio;
    await assert.rejects(transcribeCaseAudio(causaId, id, { revision: current.revision }, owner, client), status(409)); assert.match((await readCaseAudio(causaId, id, owner, client)).audio.lastError!, /TXT manual/);
    await client.causaMiembro.deleteMany({ where: { causaId, userId: reader.id } }); await assert.rejects(readCaseAudio(causaId, id, reader, client), status(404));
    console.log("Audio integration PASS: bounded immutable original, duplicate upload race cleanup, transactional audit rollback, redacted encrypted configuration, local-only no egress, actual local multipart HTTP provider, persistent lease/concurrency/retry, source and role revocation during work, version CAS/history, explicit manual edits clearing alignment, publication v1/v2 with inherited ACL and preserved user edits, malformed/oversize provider rejection; synthetic transport only, no speech-recognition claim.");
  } finally {
    failAudit = false; release.resolve(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    const fixtureAudioIds = (await client.caseAudio.findMany({ where: { causaId: { in: cases } }, select: { id: true } })).map(audio => audio.id);
    await client.caseAudioPublication.deleteMany({ where: { audioId: { in: fixtureAudioIds } } });
    await client.caseAudioTranscriptRevision.deleteMany({ where: { audioId: { in: fixtureAudioIds } } });
    await client.caseAudio.deleteMany({ where: { id: { in: fixtureAudioIds } } });
    assert.equal(await client.caseAudio.count({ where: { id: { in: fixtureAudioIds } } }), 0, "fixture audio is removed before its source documents and causes");
    await client.documento.deleteMany({ where: { causaId: { in: cases } } }); await client.causa.deleteMany({ where: { id: { in: cases } } }); await client.auditEvent.deleteMany({ where: { actorId: { in: users } } }); await client.user.deleteMany({ where: { id: { in: users } } });
    if (priorConfig) await client.integrationConfig.update({ where: { provider: "transcription" }, data: { enabled: priorConfig.enabled, configJson: priorConfig.configJson } }); else await client.integrationConfig.deleteMany({ where: { provider: "transcription" } });
    if (organizationId) await client.organization.delete({ where: { id: organizationId } }); else if (priorFirm) await client.firmSettings.update({ where: { id: priorFirm.id }, data: { assistantLlmMode: priorFirm.assistantLlmMode } });
    await client.$disconnect(); if (previousStorage === undefined) delete process.env.STORAGE_PATH; else process.env.STORAGE_PATH = previousStorage; await rm(root, { recursive: true, force: true });
  }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
