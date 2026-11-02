import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { documentReadWhere } from "@/lib/auth/causa-access";
import { createHearing, attachHearingSource, readHearing } from "@/lib/hearings/service";
import { listSourceOptions, readHearingSource } from "@/lib/hearings/sources";
import { resolveHearingCitation } from "@/lib/hearings/citations";
import { appendHearingLiveAudioClip, readHearingLiveAudio, retryHearingLiveAudioClip, startHearingLiveAudio, stopHearingLiveAudio } from "./live-service";
import { liveAudioQuerySchema, validateLiveAudioUpload } from "./live-schemas";
import { listCaseAudio, readCaseAudio, readCaseAudioOriginal, AUDIO_LEASE_MS } from "./service";
import { saveTranscriptionConfig, transcribeAudioBytes } from "./provider";
const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
function wave() { const bytes = Buffer.alloc(16044); bytes.write("RIFF"); bytes.writeUInt32LE(16036, 4); bytes.write("WAVE", 8); bytes.write("fmt ", 12); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(16000, 40); return bytes; }
async function files(root: string): Promise<string[]> { let entries; try { entries = await readdir(root, { withFileTypes: true }); } catch { return []; } return (await Promise.all(entries.map(entry => entry.isDirectory() ? files(path.join(root, entry.name)) : [path.join(root, entry.name)]))).flat().sort(); }
function gate() { let resolve!: () => void; const promise = new Promise<void>(done => { resolve = done; }); return { promise, resolve }; }
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(process.env.DATABASE_URL, url);
  if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw new Error("Live audio integration requires isolated local storage");
  const client = new PrismaClient({ datasources: { db: { url } } }), root = await mkdtemp(path.join(tmpdir(), "lexopen-live-audio-")), previousStorage = process.env.STORAGE_PATH; process.env.STORAGE_PATH = root;
  const previousConfig = await client.integrationConfig.findUnique({ where: { provider: "transcription" } }), previousFirm = await client.firmSettings.findFirst();
  let firmId = previousFirm?.id || "", organizationId = "", causaId = "", providerCalls = 0, failPublish = false, failReserve = false;
  const users: string[] = [], text = "Se exhibió un comprobante ficticio de pago. La transcripción automática debe contrastarse con la grabación.", bytes = wave();
  let mode: "ok" | "error" | "hold" = "ok", arrived = gate(), release = gate();
  const server = createServer(async (request, response) => { providerCalls++; for await (const _ of request) { void _; } if (mode === "hold") { arrived.resolve(); await release.promise; } if (mode === "error") { response.writeHead(502).end("private provider payload must never leak"); return; } response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ text, duration: 1, segments: [{ start: 0, end: 1, text }] })); });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done)); const address = server.address(); assert.ok(address && typeof address !== "string");
  const config = { enabled: true, preset: "local" as const, apiUrl: `http://127.0.0.1:${address.port}/v1`, model: "synthetic-live-whisper", responseFormat: "verbose_json" as const, apiKey: "synthetic-local-key" };
  const guarded = client.$extends({ query: { auditEvent: { async create({ args, query }) { if (failPublish && args.data.action === "hearing.audio.clip.publish" || failReserve && args.data.action === "hearing.audio.clip.reserve") throw new Error("Synthetic live audio audit rollback"); return query(args); } } } }) as unknown as PrismaClient;
  try {
    if (!firmId) { organizationId = (await client.organization.create({ data: { name: "Synthetic live audio organization" } })).id; firmId = (await client.firmSettings.create({ data: { organizationId, assistantLlmMode: "local_only" } })).id; } else await client.firmSettings.update({ where: { id: firmId }, data: { assistantLlmMode: "local_only" } });
    const actors = []; for (const role of ["abogado", "abogado", "admin"]) { const user = await client.user.create({ data: { email: `${randomUUID()}@live-audio.invalid`, password: "not-a-login", name: `Synthetic live ${role}`, role } }); actors.push(user); users.push(user.id); } const [owner, colleague, admin] = actors;
    causaId = (await client.causa.create({ data: { titulo: "Audiencia ficticia con transcripción incremental", tribunal: "Tribunal ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id } })).id;
    await client.causaMiembro.createMany({ data: [{ causaId, userId: colleague.id, rol: "colaborador" }, { causaId, userId: admin.id, rol: "colaborador" }] });
    await saveTranscriptionConfig(config, admin, client);
    const workspace = await createHearing(causaId, { title: "Mesa ficticia de audio en vivo" }, owner, client), workspaceId = workspace.id;
    const start = { requestId: randomUUID(), title: "Declaración ficticia durante audiencia" };
    const sessions = await Promise.all([startHearingLiveAudio(causaId, workspaceId, start, owner, client), startHearingLiveAudio(causaId, workspaceId, start, owner, client)]);
    assert.equal(sessions[0].session.id, sessions[1].session.id); assert.equal(sessions.filter(x => x.reused).length, 1); const sessionId = sessions[0].session.id;
    await assert.rejects(startHearingLiveAudio(causaId, workspaceId, { ...start, requestId: randomUUID() }, owner, client), status(409));
    const initial = await readHearingLiveAudio(causaId, workspaceId, owner, {}, client); assert.equal(initial.config.canCapture, true); assert.ok(!("clips" in initial.sessions[0])); assert.ok(!JSON.stringify(initial).includes("synthetic-local-key")); assert.equal(initial.maxClips, 360);
    const upload = { requestId: randomUUID(), sequence: 0, name: "tramo-ficticio.wav", bytes };
    await assert.rejects(appendHearingLiveAudioClip(causaId, workspaceId, sessionId, { ...upload, sequence: 2 }, owner, client), status(409));
    const concurrent = await Promise.all([appendHearingLiveAudioClip(causaId, workspaceId, sessionId, upload, owner, client), appendHearingLiveAudioClip(causaId, workspaceId, sessionId, upload, owner, client)]);
    assert.equal(concurrent[0].clip?.id, concurrent[1].clip?.id); assert.equal(providerCalls, 1);
    const detail = await readHearingLiveAudio(causaId, workspaceId, owner, { sessionId }, client), clip = detail.session!.clips[0]; assert.equal(clip.status, "ready"); assert.equal(clip.text, text); assert.ok(clip.sourceId && clip.audioId); assert.equal(clip.fragments[0].text, text);
    assert.equal(await client.caseAudio.count({ where: { causaId } }), 1); assert.equal((await listCaseAudio(causaId, owner, client)).audios.length, 0);
    assert.equal((await readHearing(causaId, workspaceId, owner, client)).sources.length, 0);
    const citation = await resolveHearingCitation(causaId, workspaceId, { sourceId: clip.sourceId!, fragmentId: clip.fragments[0].id, quote: text }, owner, client); assert.match(citation.warning!, /transcripción TXT/); assert.match(citation.warning!, /sin revisión humana/);
    assert.equal((await readHearingSource(causaId, workspaceId, clip.sourceId!, owner, {}, client)).fragments[0].text, text);
    for (const other of [colleague, admin]) { await assert.rejects(readHearingLiveAudio(causaId, workspaceId, other, { sessionId }, client), status(404)); await assert.rejects(readCaseAudio(causaId, clip.audioId!, other, client), status(404)); await assert.rejects(readCaseAudioOriginal(causaId, clip.audioId!, other, client), status(404)); }
    const row = await client.caseAudio.findUniqueOrThrow({ where: { id: clip.audioId! } });
    for (const other of [colleague, admin]) { assert.equal(await client.documento.count({ where: { AND: [{ id: { in: [row.sourceDocumentId, row.transcriptDocumentId!] } }, documentReadWhere(other)] } }), 0); }
    const replay = await appendHearingLiveAudioClip(causaId, workspaceId, sessionId, upload, owner, client); assert.equal(replay.reused, true); assert.equal(providerCalls, 1); assert.equal(await client.caseAudioPublication.count({ where: { audioId: clip.audioId! } }), 1);
    await assert.rejects(appendHearingLiveAudioClip(causaId, workspaceId, sessionId, { ...upload, name: "altered.wav" }, owner, client), status(409));
    await writeFile(path.join(root, row.storageKey), "tampered"); const hidden = (await readHearingLiveAudio(causaId, workspaceId, owner, { sessionId }, client)).session!.clips[0]; assert.equal(hidden.available, false); assert.equal(hidden.text, ""); assert.equal(hidden.audioId, null); assert.ok(!JSON.stringify(hidden).includes(text)); await writeFile(path.join(root, row.storageKey), bytes);
    // Synthetic automatic sources never consume or displace the manual dossier's 200-source budget.
    await client.hearingSource.createMany({ data: Array.from({ length: 201 }, (_, n) => ({ workspaceId, kind: "document", refId: `synthetic-automatic-${n}`, liveAudioClipId: `synthetic-clip-${n}` })) });
    const manual = await client.documento.create({ data: { nombre: "Documento manual ficticio.txt", contenido: "Texto manual", causaId, autorId: owner.id } }); await attachHearingSource(causaId, workspaceId, { kind: "document", refId: manual.id }, owner, client); assert.equal((await readHearing(causaId, workspaceId, owner, client)).sources.length, 1); assert.ok((await listSourceOptions(causaId, owner, client)).options.some(s => s.refId === manual.id)); assert.ok(!(await listSourceOptions(causaId, owner, client)).options.some(s => s.refId === row.transcriptDocumentId));
    mode = "error"; const second = { ...upload, requestId: randomUUID(), sequence: 1 }; const failed = await appendHearingLiveAudioClip(causaId, workspaceId, sessionId, second, owner, client); assert.equal(failed.clip!.status, "failed"); assert.ok(failed.clip!.originalHref); assert.ok(!JSON.stringify(failed).includes("private provider payload")); const callsAfterFailure = providerCalls;
    await appendHearingLiveAudioClip(causaId, workspaceId, sessionId, second, owner, client); assert.equal(providerCalls, callsAfterFailure);
    const retryId = randomUUID(); await retryHearingLiveAudioClip(causaId, workspaceId, sessionId, failed.clip!.id, { requestId: retryId }, owner, client); const callsAfterRetryFailure = providerCalls; await retryHearingLiveAudioClip(causaId, workspaceId, sessionId, failed.clip!.id, { requestId: retryId }, owner, client); assert.equal(providerCalls, callsAfterRetryFailure);
    mode = "ok"; const recovered = await retryHearingLiveAudioClip(causaId, workspaceId, sessionId, failed.clip!.id, { requestId: randomUUID() }, owner, client); assert.equal(recovered.clip!.status, "ready"); assert.equal(await client.caseAudio.count({ where: { causaId } }), 2);
    // A publication audit failure rolls back document/source/evidence and compensates only its own object.
    failPublish = true; const third = await appendHearingLiveAudioClip(causaId, workspaceId, sessionId, { ...upload, requestId: randomUUID(), sequence: 2 }, owner, guarded); failPublish = false; assert.equal(third.clip!.status, "failed"); assert.equal(await client.documento.count({ where: { id: `live_transcript_${third.clip!.id}` } }), 0); assert.equal((await files(root)).filter(file => file.includes(`live-transcripts/${third.clip!.id}/`)).length, 0); const beforeRecoveryCalls = providerCalls;
    await client.hearingLiveAudioClip.update({ where: { id: third.clip!.id }, data: { status: "transcribing", operationToken: "crashed-worker", operationLockedAt: new Date(Date.now() - AUDIO_LEASE_MS - 1) } });
    const interrupted = (await readHearingLiveAudio(causaId, workspaceId, owner, { sessionId }, client)).session!.clips.find(c => c.id === third.clip!.id)!; assert.equal(interrupted.status, "failed"); assert.match(interrupted.lastError!, /interrumpió/); assert.ok(interrupted.originalHref);
    assert.equal((await retryHearingLiveAudioClip(causaId, workspaceId, sessionId, third.clip!.id, { requestId: randomUUID() }, owner, client)).clip!.status, "ready"); assert.equal(providerCalls, beforeRecoveryCalls);
    const countBeforeReserve = await client.hearingLiveAudioClip.count({ where: { sessionId } }); failReserve = true; await assert.rejects(appendHearingLiveAudioClip(causaId, workspaceId, sessionId, { ...upload, requestId: randomUUID(), sequence: 3 }, owner, guarded)); failReserve = false; assert.equal(await client.hearingLiveAudioClip.count({ where: { sessionId } }), countBeforeReserve);
    // Configuration changes in the asynchronous authorization callback prevent any byte egress.
    const beforeConfigCalls = providerCalls;
    await assert.rejects(transcribeAudioBytes({ bytes, name: "test.wav", mimeType: "audio/wav", durationMs: 1000, beforeEgress: async () => { await saveTranscriptionConfig({ ...config, enabled: false }, admin, client); } }, client), status(409)); assert.equal(providerCalls, beforeConfigCalls); await saveTranscriptionConfig(config, admin, client);
    // Revocation while the provider is pending cannot publish derived text or a usable fragment.
    mode = "hold"; arrived = gate(); release = gate(); const pending = appendHearingLiveAudioClip(causaId, workspaceId, sessionId, { ...upload, requestId: randomUUID(), sequence: 3 }, owner, client); await arrived.promise;
    const active = await client.hearingLiveAudioClip.findUniqueOrThrow({ where: { sessionId_sequence: { sessionId, sequence: 3 } } }), activeCalls = providerCalls;
    const activeRetry = await retryHearingLiveAudioClip(causaId, workspaceId, sessionId, active.id, { requestId: randomUUID() }, owner, client); assert.equal(activeRetry.clip!.status, "transcribing"); assert.equal(providerCalls, activeCalls);
    await client.causa.update({ where: { id: causaId }, data: { abogadoId: colleague.id } }); release.resolve(); await assert.rejects(pending, status(404)); await client.causa.update({ where: { id: causaId }, data: { abogadoId: owner.id } }); mode = "ok";
    const last = await client.hearingLiveAudioClip.findUniqueOrThrow({ where: { sessionId_sequence: { sessionId, sequence: 3 } } }); assert.equal(last.status, "failed"); assert.equal(last.documentId, null); assert.equal(last.text, "");
    await stopHearingLiveAudio(causaId, workspaceId, sessionId, { requestId: randomUUID() }, owner, client); assert.equal((await stopHearingLiveAudio(causaId, workspaceId, sessionId, { requestId: randomUUID() }, owner, client)).reused, true); await assert.rejects(appendHearingLiveAudioClip(causaId, workspaceId, sessionId, { ...upload, requestId: randomUUID(), sequence: 4 }, owner, client), status(409));
    await assert.rejects(appendHearingLiveAudioClip(causaId, workspaceId, sessionId, { ...upload, bytes: Buffer.alloc(4 * 1024 * 1024 + 1) }, owner, client), status(413)); assert.throws(() => validateLiveAudioUpload({ ...upload, name: "bad.txt" }), status(415)); assert.equal(liveAudioQuerySchema.safeParse({ before: 0 }).success, false);
    console.log("Live audio PostgreSQL PASS: private server-authorized clips, configured local provider, zero external calls, exact multipart idempotency and bounded retry receipts, original preservation, automatic TXT publications/evidence/citation warnings, source catalogue separation, owner-only documents and audio even for case colleagues/admins, provider failure and audit compensation, no stale-config egress, revocation during provider await, source tamper redaction, stop/limits and no synthetic legal/audio-time claims.");
  } finally {
    release.resolve(); await new Promise<void>(done => server.close(() => done()));
    if (causaId) { await client.caseAudio.deleteMany({ where: { causaId } }); await client.hearingWorkspace.deleteMany({ where: { causaId } }); await client.documento.deleteMany({ where: { causaId } }); await client.causaMiembro.deleteMany({ where: { causaId } }); await client.causa.deleteMany({ where: { id: causaId } }); }
    for (const id of users) { await client.auditEvent.deleteMany({ where: { actorId: id } }); await client.user.deleteMany({ where: { id } }); }
    if (previousConfig) await client.integrationConfig.upsert({ where: { provider: "transcription" }, create: { provider: "transcription", configJson: previousConfig.configJson, enabled: previousConfig.enabled }, update: { configJson: previousConfig.configJson, enabled: previousConfig.enabled } }); else await client.integrationConfig.deleteMany({ where: { provider: "transcription" } });
    if (previousFirm) await client.firmSettings.update({ where: { id: previousFirm.id }, data: { assistantLlmMode: previousFirm.assistantLlmMode } }); else { if (firmId) await client.firmSettings.deleteMany({ where: { id: firmId } }); if (organizationId) await client.organization.deleteMany({ where: { id: organizationId } }); }
    await client.$disconnect(); if (previousStorage === undefined) delete process.env.STORAGE_PATH; else process.env.STORAGE_PATH = previousStorage; await rm(root, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
