import { Prisma, type CaseAudio, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { writeAuditStrict } from "@/lib/audit";
import { httpError } from "@/lib/auth/access";
import { assertCausaAccess, assertCausaCapability, documentReadWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { can, canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { sha256 } from "@/lib/evidence/fragments";
import { getObjectBounded, putObject } from "@/lib/storage";
import { AUDIO_MAX_BYTES, audioEditSchema, audioRevisionSchema, identifyAudio, validateSegments, type AudioUpload } from "./ingest";
import { discardAudioAttempt } from "./storage";
import { transcribeAudioBytes } from "./provider";
import type { AudioSegment, CaseAudioDetail, CaseAudioView } from "./types";
import { workspaceFor } from "@/lib/hearings/access";

type AudioClient = PrismaClient | Prisma.TransactionClient;
export const AUDIO_LEASE_MS = 120_000;
const missing = () => httpError("Grabación no encontrada o sin acceso actual", 404);
async function transaction<T>(client: PrismaClient, action: (tx: Prisma.TransactionClient) => Promise<T>) {
  for (let attempt = 0; ; attempt++) {
    try { return await client.$transaction(action, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30_000 }); }
    catch (error) { if (attempt < 3 && error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code)) continue; throw error; }
  }
}
export async function audioActorFor(user: CausaAccessUser, client: AudioClient = prisma) {
  const actor = await client.user.findUnique({ where: { id: user.id }, select: { id: true, name: true, role: true, capabilityGrants: true, capabilityRevokes: true } });
  if (!actor || !isStaff(actor.role) || !canSome(actor, "assistant.use")) throw httpError("No tiene permiso para consultar las grabaciones del expediente", 403);
  return actor;
}
async function audioFor(causaId: string, id: string, user: CausaAccessUser, client: AudioClient, write = false) {
  const actor = await audioActorFor(user, client);
  const access = write ? await assertCausaCapability(causaId, actor, "causa.write", client) : await assertCausaAccess(causaId, actor, { auditOverride: false }, client);
  const audio = await client.caseAudio.findFirst({ where: { id, causaId, deletedAt: null } }); if (!audio) throw missing();
  if (audio.liveSessionId) {
    const session = await client.hearingLiveAudioSession.findUnique({ where: { id: audio.liveSessionId }, select: { workspaceId: true } });
    if (!session) throw missing();
    await workspaceFor(causaId, session.workspaceId, actor, client, write);
  }
  const source = await client.documento.findFirst({ where: { AND: [{ id: audio.sourceDocumentId, causaId, storageKey: audio.storageKey }, documentReadWhere(actor)] } });
  if (!source) throw missing();
  return { actor, audio, source, canWrite: can(actor, "causa.write", { causaRol: access.causaRol }) };
}
async function originalBytes(audio: CaseAudio) {
  const bytes = await getObjectBounded(audio.storageKey, AUDIO_MAX_BYTES);
  if (!bytes || bytes.length !== audio.sizeBytes || sha256(bytes) !== audio.sourceSha256 || identifyAudio(audio.sourceName, bytes).mimeType !== audio.mimeType) throw httpError("El original no está disponible o no coincide con su huella; no puede usarse esta transcripción", 409);
  return bytes;
}
function segmentsFor(audio: Pick<CaseAudio, "segmentsJson" | "durationMs" | "transcriptText" | "transcriptSha256">) {
  if (audio.transcriptText && sha256(audio.transcriptText) !== audio.transcriptSha256) throw httpError("La transcripción no coincide con su huella registrada", 409);
  let raw: unknown; try { raw = JSON.parse(audio.segmentsJson); } catch { throw httpError("Las marcas de tiempo de la transcripción están dañadas", 409); }
  return validateSegments(raw, audio.durationMs);
}
function view(audio: CaseAudio, full = false): CaseAudioView {
  return { id: audio.id, causaId: audio.causaId, sourceDocumentId: audio.sourceDocumentId, transcriptDocumentId: audio.transcriptDocumentId, title: audio.title, sourceName: audio.sourceName, mimeType: audio.mimeType, sizeBytes: audio.sizeBytes, sourceSha256: audio.sourceSha256, durationMs: audio.durationMs, status: audio.status, reviewStatus: audio.reviewStatus, revision: audio.revision, provider: audio.provider, model: audio.model, lastError: audio.lastError, createdAt: audio.createdAt.toISOString(), updatedAt: audio.updatedAt.toISOString(), ...(full ? { transcriptText: audio.transcriptText, segments: segmentsFor(audio), transcriptSha256: audio.transcriptSha256 } : {}) };
}
function assertRevision(audio: CaseAudio, revision: number) { if (audio.revision !== revision) throw httpError("La grabación cambió; recargue antes de continuar", 409); }
function assertIdle(audio: CaseAudio) { if (audio.operationToken && audio.operationLockedAt && Date.now() - audio.operationLockedAt.getTime() < AUDIO_LEASE_MS) throw httpError("Hay una transcripción en curso; espere antes de modificarla", 409); }
async function audit(audio: CaseAudio, actorId: string, action: string, tx: Prisma.TransactionClient) {
  await writeAuditStrict({ actorId, action, entityType: "CaseAudio", entityId: audio.id, after: { causaId: audio.causaId, sourceSha256: audio.sourceSha256, transcriptSha256: audio.transcriptSha256, revision: audio.revision, status: audio.status, reviewStatus: audio.reviewStatus, provider: audio.provider, model: audio.model } }, tx);
}
async function recordRevision(audio: CaseAudio, actorId: string, tx: Prisma.TransactionClient) {
  await tx.caseAudioTranscriptRevision.create({ data: { audioId: audio.id, actorId, revision: audio.revision, text: audio.transcriptText, segmentsJson: audio.segmentsJson, textSha256: audio.transcriptSha256!, reviewStatus: audio.reviewStatus, provider: audio.provider, model: audio.model } });
}

export async function listCaseAudio(causaId: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const actor = await audioActorFor(user, client), access = await assertCausaAccess(causaId, actor, { auditOverride: false }, client);
  const rows = await client.caseAudio.findMany({ where: { causaId, deletedAt: null, liveSessionId: null, sourceDocument: { AND: [{ causaId }, documentReadWhere(actor)] } }, include: { sourceDocument: { select: { storageKey: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], take: 201 });
  return { audios: rows.slice(0, 200).filter(row => row.sourceDocument.storageKey === row.storageKey).map(row => view(row)), limited: rows.length > 200, canWrite: can(actor, "causa.write", { causaRol: access.causaRol }), canConfigure: can(actor, "host.admin"), maxBytes: AUDIO_MAX_BYTES };
}
export async function readCaseAudio(causaId: string, id: string, user: CausaAccessUser, client: PrismaClient = prisma): Promise<CaseAudioDetail> {
  return transaction(client, async tx => {
    const { audio, actor, canWrite } = await audioFor(causaId, id, user, tx); await originalBytes(audio);
    const rows = await tx.caseAudioTranscriptRevision.findMany({ where: { audioId: id }, include: { actor: { select: { name: true } } }, orderBy: { revision: "desc" }, take: 100 });
    const history = rows.map(row => { if (sha256(row.text) !== row.textSha256) throw httpError("Una versión histórica no coincide con su huella", 409); return { id: row.id, revision: row.revision, text: row.text, segments: validateSegments(JSON.parse(row.segmentsJson), audio.durationMs), textSha256: row.textSha256, reviewStatus: row.reviewStatus, provider: row.provider, model: row.model, actorName: row.actor.name, createdAt: row.createdAt.toISOString() }; });
    return { audio: view(audio, true), history, canWrite, canConfigure: can(actor, "host.admin") };
  });
}
async function discardAttempt(key: string, failure?: unknown) {
  try { await discardAudioAttempt(key); }
  catch (error) { console.error("audio.upload.cleanup_failed", { key }); throw Object.assign(new AggregateError(failure === undefined ? [error] : [failure, error], "No se pudo retirar un archivo temporal; consulte al administrador del almacenamiento"), { status: 503 }); }
}
type LiveUploadScope = { workspaceId: string; sessionId: string; clipId: string };
async function liveUploadGuard(causaId: string, scope: LiveUploadScope, input: AudioUpload, actor: CausaAccessUser, client: AudioClient) {
  await workspaceFor(causaId, scope.workspaceId, actor, client, true);
  const clip = await client.hearingLiveAudioClip.findFirst({ where: { id: scope.clipId, sessionId: scope.sessionId, session: { workspaceId: scope.workspaceId }, sourceSha256: sha256(input.bytes), sizeBytes: input.bytes.length } });
  if (!clip) throw missing();
}
export async function uploadCaseAudio(causaId: string, input: AudioUpload, user: CausaAccessUser, client: PrismaClient = prisma) { return uploadAudio(causaId, input, user, client); }
/** Internal entry point. The public multipart import has no way to select a live scope or bypass its 200-file limit. */
export async function uploadHearingLiveAudio(causaId: string, scope: LiveUploadScope, input: AudioUpload, user: CausaAccessUser, client: PrismaClient = prisma) { return uploadAudio(causaId, input, user, client, scope); }
async function uploadAudio(causaId: string, input: AudioUpload, user: CausaAccessUser, client: PrismaClient, live?: LiveUploadScope) {
  const actor = await audioActorFor(user, client); await assertCausaCapability(causaId, actor, "causa.write", client);
  if (live) await liveUploadGuard(causaId, live, input, actor, client);
  const requestId = z.string().trim().min(8).max(100).parse(input.requestId), title = z.string().trim().min(1).max(240).parse(input.title), sourceName = z.string().trim().min(1).max(240).parse(input.name).replace(/[\r\n\0]/g, "_");
  const format = identifyAudio(sourceName, input.bytes), sourceSha256 = sha256(input.bytes);
  const where = { causaId_uploadedById_requestId: { causaId, uploadedById: actor.id, requestId } };
  const prior = await client.caseAudio.findUnique({ where });
  const same = (row: CaseAudio) => { if (row.deletedAt || row.liveSessionId !== (live?.sessionId || null) || row.sourceSha256 !== sourceSha256 || row.title !== title || row.sourceName !== sourceName) throw httpError("Esta importación ya se utilizó para otra grabación; inicie una nueva", 409); };
  if (prior) { same(prior); return { audio: (await readCaseAudio(causaId, prior.id, actor, client)).audio, reused: true }; }
  const id = `audio_${sha256(`${causaId}:${actor.id}:${requestId}`).slice(0, 40)}`, storageKey = `case-audio/${id}/attempts/${randomUUID()}/original/${sourceSha256}`;
  let result: { audio: CaseAudioView; reused: boolean };
  try {
    await putObject({ key: storageKey, body: input.bytes, contentType: format.mimeType });
    result = await transaction(client, async tx => {
      const current = await audioActorFor(user, tx); await assertCausaCapability(causaId, current, "causa.write", tx);
      if (live) await liveUploadGuard(causaId, live, input, current, tx);
      const existing = await tx.caseAudio.findUnique({ where });
      if (existing) { same(existing); const checked = await audioFor(causaId, existing.id, current, tx); await originalBytes(checked.audio); return { audio: view(checked.audio), reused: true }; }
      if (!live && await tx.caseAudio.count({ where: { causaId, deletedAt: null, liveSessionId: null } }) >= 200) throw httpError("El expediente admite hasta 200 grabaciones importadas; los tramos en vivo se organizan por sesión", 413);
      const source = await tx.documento.create({ data: { nombre: sourceName, tipo: "audio", mimeType: format.mimeType, storageKey, confidencial: Boolean(live), ruta: live ? `Audiencias/En vivo/${live.sessionId}/Grabaciones` : "Audiencias/Grabaciones", causaId, autorId: current.id, extractionStatus: "unsupported", extractionJson: JSON.stringify({ method: "audio-original", sourceSha256, textAvailable: false }) } });
      const audio = await tx.caseAudio.create({ data: { id, causaId, uploadedById: current.id, requestId, liveSessionId: live?.sessionId, sourceDocumentId: source.id, storageKey, title, sourceName, sourceSha256, mimeType: format.mimeType, sizeBytes: input.bytes.length, durationMs: format.durationMs } });
      await audit(audio, current.id, "audio.upload", tx); return { audio: view(audio), reused: false };
    });
  } catch (error) { await discardAttempt(storageKey, error); throw error; }
  if (result.reused) await discardAttempt(storageKey);
  return result;
}
export async function readCaseAudioOriginal(causaId: string, id: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const { audio } = await audioFor(causaId, id, user, client), bytes = await originalBytes(audio);
  // Recheck access after the asynchronous storage read, including a moved or restricted source.
  await audioFor(causaId, id, user, client); return { audio: view(audio), bytes };
}
export async function editCaseAudio(causaId: string, id: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = audioEditSchema.parse(raw);
  return transaction(client, async tx => {
    const { audio, actor } = await audioFor(causaId, id, user, tx, true); await originalBytes(audio); assertRevision(audio, input.revision); assertIdle(audio);
    const changed = input.transcriptText !== audio.transcriptText;
    const segments = input.segments === undefined ? changed ? [] : segmentsFor(audio) : validateSegments(input.segments, audio.durationMs);
    if (segments.length && segments.map(s => s.text).join(" ").replace(/\s+/g, " ").trim() !== input.transcriptText.replace(/\s+/g, " ").trim()) throw httpError("Las marcas de tiempo deben corresponder al texto completo; elimínelas si está corrigiendo la transcripción", 422);
    const updated = await tx.caseAudio.updateMany({ where: { id, revision: audio.revision, operationToken: audio.operationToken }, data: { transcriptText: input.transcriptText, transcriptSha256: sha256(input.transcriptText), segmentsJson: JSON.stringify(segments), status: "ready", reviewStatus: input.reviewed ? "reviewed" : "unreviewed", reviewedById: input.reviewed ? actor.id : null, provider: changed ? "manual" : audio.provider, model: changed ? null : audio.model, operationToken: null, operationLockedAt: null, lastError: null, revision: { increment: 1 } } });
    if (!updated.count) throw httpError("La transcripción cambió; recargue antes de continuar", 409);
    const saved = await tx.caseAudio.findUniqueOrThrow({ where: { id } }); await recordRevision(saved, actor.id, tx); await audit(saved, actor.id, input.reviewed ? "audio.transcript.review" : "audio.transcript.edit", tx);
    return { audio: view(saved, true) };
  });
}
export async function transcribeCaseAudio(causaId: string, id: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma, guard?: (client: AudioClient) => Promise<void>) {
  const { revision } = audioRevisionSchema.parse(raw), token = randomUUID();
  const claimed = await transaction(client, async tx => {
    if (guard) await guard(tx);
    const { audio, actor } = await audioFor(causaId, id, user, tx, true); await originalBytes(audio); assertRevision(audio, revision); assertIdle(audio);
    const result = await tx.caseAudio.updateMany({ where: { id, revision, operationToken: audio.operationToken }, data: { status: "transcribing", operationToken: token, operationLockedAt: new Date(), lastError: null } });
    if (!result.count) throw httpError("Otra transcripción ya está en curso", 409);
    await audit({ ...audio, status: "transcribing" }, actor.id, "audio.transcription.start", tx); return audio;
  });
  try {
    const bytes = await originalBytes(claimed);
    const result = await transcribeAudioBytes({ bytes, name: claimed.sourceName, mimeType: claimed.mimeType, durationMs: claimed.durationMs, beforeEgress: async () => { if (guard) await guard(client); const { audio } = await audioFor(causaId, id, user, client, true); if (audio.operationToken !== token || audio.revision !== revision) throw httpError("La operación fue reemplazada", 409); await originalBytes(audio); } }, client);
    return await transaction(client, async tx => {
      if (guard) await guard(tx);
      const { audio, actor } = await audioFor(causaId, id, user, tx, true); await originalBytes(audio);
      if (audio.operationToken !== token || audio.revision !== revision || !audio.operationLockedAt || Date.now() - audio.operationLockedAt.getTime() >= AUDIO_LEASE_MS) throw httpError("La transcripción caducó o fue reemplazada; vuelva a solicitarla", 409);
      const changed = await tx.caseAudio.updateMany({ where: { id, revision, operationToken: token }, data: { transcriptText: result.text, transcriptSha256: sha256(result.text), segmentsJson: JSON.stringify(result.segments), durationMs: result.durationMs, status: "ready", reviewStatus: "unreviewed", reviewedById: null, provider: result.provider, model: result.model, operationToken: null, operationLockedAt: null, lastError: null, revision: { increment: 1 } } });
      if (!changed.count) throw httpError("La grabación cambió durante la transcripción", 409);
      const saved = await tx.caseAudio.findUniqueOrThrow({ where: { id } }); await recordRevision(saved, actor.id, tx); await audit(saved, actor.id, "audio.transcription.complete", tx); return { audio: view(saved, true) };
    });
  } catch (error) {
    // Cleanup uses only the owned lease, never modifies a newer operation, and stores no provider payload.
    const message = error instanceof Error && "status" in error ? error.message : "No se pudo completar la transcripción; el original se conserva";
    await transaction(client, async tx => {
      const changed = await tx.caseAudio.updateMany({ where: { id, causaId, revision, operationToken: token }, data: { status: "failed", lastError: message.slice(0, 500), operationToken: null, operationLockedAt: null, revision: { increment: 1 } } });
      if (changed.count) { const row = await tx.caseAudio.findUniqueOrThrow({ where: { id } }); await audit(row, user.id, "audio.transcription.failed", tx); }
    });
    throw error;
  }
}

function timecode(ms: number) { const seconds = Math.floor(ms / 1000); return `${Math.floor(seconds / 3600).toString().padStart(2, "0")}:${Math.floor(seconds % 3600 / 60).toString().padStart(2, "0")}:${(seconds % 60).toString().padStart(2, "0")}.${Math.round(ms % 1000).toString().padStart(3, "0")}`; }
export function transcriptTextFile(audio: CaseAudioView & { transcriptText: string; segments: AudioSegment[] }) {
  const reviewed = audio.reviewStatus === "reviewed";
  return [`${reviewed ? "TRANSCRIPCIÓN REVISADA POR UNA PERSONA" : audio.provider === "manual" ? "TRANSCRIPCIÓN MANUAL SIN REVISIÓN CONFIRMADA" : "TRANSCRIPCIÓN AUTOMÁTICA SIN REVISIÓN HUMANA"}`, audio.title, `Audio LexOpen: ${audio.id}`, `Expediente: ${audio.causaId}`, `Archivo: ${audio.sourceName}`, `SHA-256 del audio: ${audio.sourceSha256}`, `SHA-256 del texto: ${audio.transcriptSha256}`, `Revisión: ${audio.revision} · ${audio.reviewStatus}`, `Método: ${audio.provider || "manual"}${audio.model ? ` · ${audio.model}` : ""}`, "La huella acredita la integridad del archivo. No acredita que el texto represente fielmente cada palabra del audio; corrobórelo escuchando la grabación.", "", audio.transcriptText, ...(audio.segments.length ? ["", "MARCAS DE TIEMPO INFORMADAS O REVISADAS", ...audio.segments.map(s => `[${timecode(s.startMs)}–${timecode(s.endMs)}] ${s.speaker ? `${s.speaker}: ` : ""}${s.text}`)] : ["", "Sin marcas de tiempo disponibles."]), ""].join("\n");
}
export async function publishCaseAudio(causaId: string, id: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const { revision } = audioRevisionSchema.parse(raw);
  return transaction(client, async tx => {
    const { audio, actor, source } = await audioFor(causaId, id, user, tx, true); await originalBytes(audio); assertRevision(audio, revision); assertIdle(audio);
    if (!audio.transcriptText.trim()) throw httpError("Prepare o importe una transcripción antes de guardarla en la carpeta", 409);
    const full = view(audio, true), text = transcriptTextFile({ ...full, transcriptText: audio.transcriptText, segments: segmentsFor(audio) });
    const label = audio.reviewStatus === "reviewed" ? "revisada" : audio.provider === "manual" ? "manual sin revisión" : "automática sin revisión";
    const nombre = `Transcripción ${label} · ${audio.title.slice(0, 150)} · v${revision}.txt`;
    const document = await tx.documento.create({ data: { nombre, tipo: "transcripcion", mimeType: "text/plain", contenido: text, extractedMarkdown: text, extractionStatus: "completed", extractionJson: JSON.stringify({ method: "audio-transcript-snapshot", audioId: id, audioSha256: audio.sourceSha256, transcriptSha256: audio.transcriptSha256, revision, reviewStatus: audio.reviewStatus, provider: audio.provider, model: audio.model, speechCorroboration: "human-review-required" }), ruta: "Audiencias/Transcripciones", causaId, autorId: actor.id, confidencial: source.confidencial, privilegio: source.privilegio } });
    await tx.caseAudioPublication.create({ data: { audioId: id, documentId: document.id } });
    const changed = await tx.caseAudio.updateMany({ where: { id, revision }, data: { transcriptDocumentId: document.id, revision: { increment: 1 }, operationToken: null, operationLockedAt: null } });
    if (!changed.count) throw httpError("La grabación cambió; no se guardó la transcripción", 409);
    const saved = await tx.caseAudio.findUniqueOrThrow({ where: { id } }); await audit(saved, actor.id, "audio.transcript.publish", tx);
    return { audio: view(saved, true), document: { id: document.id, nombre, ruta: document.ruta, causaId }, evidenceStatus: "not_indexed" };
  });
}
