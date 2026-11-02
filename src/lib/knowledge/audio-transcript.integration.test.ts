import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import { assertDisposableDatabaseUrl } from "@/lib/testing/disposable-db";
import { uploadCaseAudio, editCaseAudio, publishCaseAudio } from "@/lib/audio/service";
import { captureDocumentEvidence } from "@/lib/evidence/service";
import { searchResearch, readResearchRun, verifyResearchCitation } from "@/lib/research/service";
import { resolveCitation, toStoredCitation, verifyStoredCitation } from "./citations";
import { audioTranscriptNotice } from "./audio-transcript";

const status = (code: number) => (error: unknown) => (error as { status?: number }).status === code;
function wavFixture() {
  const size = 8000 * 2, bytes = Buffer.alloc(44 + size); bytes.write("RIFF", 0); bytes.writeUInt32LE(36 + size, 4); bytes.write("WAVEfmt ", 8); bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22); bytes.writeUInt32LE(8000, 24); bytes.writeUInt32LE(16000, 28); bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36); bytes.writeUInt32LE(size, 40); return bytes;
}
async function main() {
  const url = assertDisposableDatabaseUrl(process.env.E2E_DATABASE_URL); assert.equal(url, process.env.DATABASE_URL);
  if ([process.env.S3_BUCKET, process.env.S3_ACCESS_KEY_ID, process.env.S3_SECRET_ACCESS_KEY].some(Boolean)) throw Error("Requires local fixture storage");
  const root = await mkdtemp(path.join(tmpdir(), "lexopen-audio-citation-test-")), previousStorage = process.env.STORAGE_PATH; process.env.STORAGE_PATH = root;
  const db = new PrismaClient({ datasources: { db: { url } } }), userIds: string[] = []; let causaId = "";
  const fetchBefore = globalThis.fetch; let networkCalls = 0; globalThis.fetch = (async () => { networkCalls++; throw Error("Audio citation integration uses no speech provider or remote network"); }) as typeof fetch;
  try {
    const owner = await db.user.create({ data: { email: `${randomUUID()}@audio-citation-fixture.invalid`, name: "Audio citation fixture owner", password: "not-a-login", role: "abogado" } }); userIds.push(owner.id);
    const reader = await db.user.create({ data: { email: `${randomUUID()}@audio-citation-fixture.invalid`, name: "Audio citation fixture reader", password: "not-a-login", role: "abogado" } }); userIds.push(reader.id);
    const causa = await db.causa.create({ data: { titulo: "Expediente ficticio de publicaciones de audio", tribunal: "Tribunal ficticio", materia: "civil", acceso: "equipo", abogadoId: owner.id, miembros: { create: { userId: reader.id, rol: "lectura" } } } }); causaId = causa.id;
    const uploaded = await uploadCaseAudio(causaId, { requestId: randomUUID(), title: "Grabación silenciosa enteramente ficticia", name: "fixture.wav", bytes: wavFixture() }, owner, db);
    const quote = "La prueba del pago exige antecedentes comprobables.", transcriptText = `${quote} Este texto es ficticio y no proviene de reconocimiento de voz.`;
    const edited = await editCaseAudio(causaId, uploaded.audio.id, { revision: uploaded.audio.revision, transcriptText, reviewed: false }, owner, db);
    // Mark the fixture snapshot automatic without contacting or simulating a real provider.
    await db.caseAudio.update({ where: { id: uploaded.audio.id }, data: { provider: "fixture-automatic", model: "fixture-model" } });
    const first = await publishCaseAudio(causaId, uploaded.audio.id, { revision: edited.audio.revision }, owner, db);
    const firstEvidence = await captureDocumentEvidence(first.document.id, owner, db), firstFragment = await db.documentEvidenceFragment.findFirstOrThrow({ where: { versionId: firstEvidence.id, text: { contains: quote } } });
    const input = { kind: "document" as const, fragmentId: firstFragment.id, quote };
    const automatic = await resolveCitation(input, owner, { causaId, client: db });
    assert.equal(automatic.audioTranscript?.verificationBasis, "transcript_text"); assert.equal(automatic.audioTranscript?.reviewStatus, "unreviewed"); assert.equal(automatic.audioTranscript?.revision, edited.audio.revision); assert.ok(automatic.warnings.some(warning => warning.includes(audioTranscriptNotice)));
    const pinned = toStoredCitation(automatic); assert.equal("audioTranscript" in pinned, false); assert.equal("warnings" in pinned, false);
    const reviewedAudio = await editCaseAudio(causaId, uploaded.audio.id, { revision: first.audio.revision, transcriptText, reviewed: true }, owner, db);
    const second = await publishCaseAudio(causaId, uploaded.audio.id, { revision: reviewedAudio.audio.revision }, owner, db);
    const secondEvidence = await captureDocumentEvidence(second.document.id, owner, db), secondFragment = await db.documentEvidenceFragment.findFirstOrThrow({ where: { versionId: secondEvidence.id, text: { contains: quote } } });
    const reviewed = await resolveCitation({ kind: "document", fragmentId: secondFragment.id, quote }, owner, { causaId, client: db });
    assert.equal(reviewed.audioTranscript?.reviewStatus, "reviewed"); assert.equal(reviewed.audioTranscript?.revision, reviewedAudio.audio.revision); assert.ok(reviewed.warnings.some(warning => /registra revisión humana/.test(warning)));
    const old = await verifyStoredCitation(pinned, owner, { causaId, client: db }); assert.equal(old.audioTranscript?.reviewStatus, "unreviewed"); assert.equal(old.sourceKey, automatic.sourceKey); assert.ok(old.warnings.some(warning => /automática sin revisión/.test(warning)));
    const research = await searchResearch(owner, { query: "prueba pago", causaId, documentIds: [first.document.id, second.document.id] }, db);
    assert.equal(research.results.length, 2); assert.ok(research.warnings.some(warning => warning.includes(audioTranscriptNotice)));
    assert.equal(research.results.find(citation => citation.documentId === first.document.id)?.audioTranscript?.reviewStatus, "unreviewed");
    assert.equal(research.results.find(citation => citation.documentId === second.document.id)?.audioTranscript?.reviewStatus, "reviewed");
    const verifyResearch = await verifyResearchCitation(input, owner, db); assert.equal(verifyResearch.verified, true); assert.equal(verifyResearch.audioTranscript?.reviewStatus, "unreviewed"); assert.ok(verifyResearch.warnings.some(warning => warning.includes(audioTranscriptNotice)));
    // Old saved research has no context fields: rehydrate them from the publication relation.
    const oldRun = structuredClone(research); oldRun.warnings = [];
    for (const citation of oldRun.results) { delete citation.audioTranscript; delete citation.warnings; }
    await db.researchRun.update({ where: { id: research.id }, data: { resultJson: JSON.stringify(oldRun) } });
    const freshRun = await readResearchRun(research.id, owner, db); assert.ok(freshRun.warnings.some(warning => warning.includes(audioTranscriptNotice))); assert.equal(freshRun.results.find(citation => citation.documentId === first.document.id)?.audioTranscript?.reviewStatus, "unreviewed");
    // All publications inherit the original source ACL even after a later snapshot becomes current.
    const cache = new Map<string, unknown>(); await resolveCitation(input, reader, { causaId, client: db, cache });
    await db.documento.update({ where: { id: uploaded.audio.sourceDocumentId }, data: { confidencial: true } });
    await db.user.update({ where: { id: reader.id }, data: { capabilityRevokes: "doc.confidential.read" } });
    await assert.rejects(resolveCitation(input, reader, { causaId, client: db, cache }), status(404));
    await assert.rejects(resolveCitation({ kind: "document", fragmentId: secondFragment.id, quote }, reader, { causaId, client: db, cache }), status(404));
    const firstVersion = await db.documentEvidenceVersion.findUniqueOrThrow({ where: { id: firstEvidence.id } });
    const original = await readFile(path.join(root, firstVersion.sourceStorageKey!)); await writeFile(path.join(root, firstVersion.sourceStorageKey!), "changed TXT");
    await assert.rejects(resolveCitation(input, owner, { causaId, client: db }), status(409));
    await assert.rejects(verifyResearchCitation(input, owner, db), status(409));
    await assert.rejects(readResearchRun(research.id, owner, db), status(409));
    const tamperedSearch = await searchResearch(owner, { query: "prueba pago", causaId, documentIds: [first.document.id] }, db); assert.equal(tamperedSearch.status, "abstained");
    await writeFile(path.join(root, firstVersion.sourceStorageKey!), original);
    assert.equal(networkCalls, 0);
    console.log("Audio transcript citations PostgreSQL PASS: each publication's immutable review status, old/new snapshots, TXT versus voice/timing warning, common citation and research/history/verify propagation, unchanged stored source identity, original-source ACL revocation across all snapshots, retained TXT integrity and zero speech/network calls.");
  } finally { globalThis.fetch = fetchBefore; await db.auditEvent.deleteMany({ where: { actorId: { in: userIds } } }); if (causaId) { await db.caseAudio.deleteMany({ where: { causaId } }); await db.documento.deleteMany({ where: { causaId } }); await db.causa.deleteMany({ where: { id: causaId } }); } await db.user.deleteMany({ where: { id: { in: userIds } } }); await db.$disconnect(); await rm(root, { recursive: true, force: true }); if (previousStorage === undefined) delete process.env.STORAGE_PATH; else process.env.STORAGE_PATH = previousStorage; }
}
void main().catch(error => { console.error(error); process.exitCode = 1; });
