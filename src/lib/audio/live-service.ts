import { randomUUID } from "node:crypto";
import type { HearingLiveAudioClip, HearingLiveAudioSession, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { documentReadWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { can } from "@/lib/auth/permissions";
import { writeAuditStrict } from "@/lib/audit";
import { sha256 } from "@/lib/evidence/fragments";
import { storeEvidenceSnapshot } from "@/lib/evidence/service";
import { putObject } from "@/lib/storage";
import { discardLiveTranscriptAttempt } from "./live-storage";
import { hearingTransaction, isUnavailable, workspaceFor, type HearingClient } from "@/lib/hearings/access";
import { resolveHearingCitation } from "@/lib/hearings/citations";
import { audioTranscriptNotice } from "@/lib/knowledge/audio-transcript";
import { hearingTranscriptionReadiness } from "./provider";
import { readCaseAudio, readCaseAudioOriginal, transcribeCaseAudio, uploadHearingLiveAudio, AUDIO_LEASE_MS } from "./service";
import { LIVE_AUDIO_LIMITS as L, liveAudioCommandSchema, liveAudioQuerySchema, liveAudioStartSchema, validateLiveAudioUpload, type LiveAudioUpload } from "./live-schemas";
import type { HearingLiveAudioClipView, HearingLiveAudioMutation, HearingLiveAudioSessionSummary, HearingLiveAudioSessionView, HearingLiveAudioView } from "./live-types";
const missing = () => httpError("La sesión de captura no está disponible con sus permisos actuales", 404);
const conflict = (message = "El tramo cambió o hay otra operación en curso. Actualice la sesión antes de continuar") => httpError(message, 409);
const warnings = ["La transcripción aparece por tramos, después del procesamiento. No es reconocimiento instantáneo palabra por palabra.", audioTranscriptNotice, "Los audios y las publicaciones de esta mesa son privados. Cada tramo conserva su propio original; puede haber pausas entre tramos."];
const summary = (row: HearingLiveAudioSession, count: number): HearingLiveAudioSessionSummary => ({ id: row.id, title: row.title, status: row.status === "recording" ? "recording" : "stopped", nextSequence: row.nextSequence, totalBytes: row.totalBytes, maxClips: L.clips, maxBytes: L.sessionBytes, createdAt: row.createdAt.toISOString(), closedAt: row.closedAt?.toISOString() || null, clipCount: count });
async function sessionFor(causaId: string, workspaceId: string, sessionId: string, user: CausaAccessUser, client: HearingClient, write = false) {
  const access = await workspaceFor(causaId, workspaceId, user, client, write), session = await client.hearingLiveAudioSession.findFirst({ where: { id: sessionId, workspaceId } });
  if (!session) throw missing(); return { ...access, session };
}
async function audit(client: HearingClient, actorId: string, sessionId: string, action: string, fields: Record<string, unknown> = {}) { await writeAuditStrict({ actorId, action: `hearing.audio.${action}`, entityType: "HearingLiveAudioSession", entityId: sessionId, after: fields }, client); }
async function captureReady(client: PrismaClient, actor: CausaAccessUser) {
  if (!can(actor, "doc.confidential.read")) throw httpError("La captura privada requiere permiso para documentos confidenciales", 403);
  const config = await hearingTranscriptionReadiness(client); if (!config.canCapture) throw httpError(config.warnings[0] || "El transcriptor no está disponible", 409); return config;
}
function hiddenClip(row: HearingLiveAudioClip): HearingLiveAudioClipView { return { id: row.id, sequence: row.sequence, status: row.status === "ready" ? "ready" : row.status === "failed" ? "failed" : row.status === "pending" ? "pending" : "transcribing", available: false, audioId: null, title: "Tramo no disponible", sourceName: "", durationMs: null, text: "", revision: 1, sourceId: null, fragments: [], originalHref: null, transcriptHref: null, lastError: null, warnings: ["No se muestra contenido de un original o una publicación sin acceso actual."] }; }
async function clipView(causaId: string, workspaceId: string, session: HearingLiveAudioSession, row: HearingLiveAudioClip, actor: CausaAccessUser, client: PrismaClient, cache: Map<string, unknown>): Promise<HearingLiveAudioClipView> {
  const interrupted = ["pending", "transcribing"].includes(row.status) && Date.now() - (row.operationLockedAt || row.updatedAt).getTime() >= AUDIO_LEASE_MS;
  if (interrupted) row = { ...row, status: "failed", lastError: row.audioId ? "El procesamiento se interrumpió. El original se conserva; puede reintentar la transcripción guardada." : "El original no se confirmó en el Host. Reenvíe el mismo tramo desde la cola pendiente de esta pestaña o inicie otra captura." };
  if (!row.audioId) return { ...hiddenClip(row), available: true, title: `Tramo ${row.sequence + 1}`, sourceName: row.sourceName, lastError: row.lastError, warnings: ["El original todavía no se ha confirmado en el Host. Conserve el tramo pendiente en esta pestaña para reintentarlo."] };
  try {
    const { audio } = await readCaseAudioOriginal(causaId, row.audioId, actor, client);
    if (audio.sourceSha256 !== row.sourceSha256) return hiddenClip(row);
    const value: HearingLiveAudioClipView = { ...hiddenClip(row), available: true, audioId: audio.id, title: audio.title, sourceName: audio.sourceName, durationMs: audio.durationMs, revision: audio.revision, originalHref: `/api/causas/${causaId}/audios/${audio.id}/original`, lastError: row.lastError, warnings: [audioTranscriptNotice] };
    if (row.status !== "ready") return value;
    if (!row.documentId || !row.sourceId || !row.textSha256 || sha256(row.text) !== row.textSha256) return hiddenClip(row);
    const source = await client.hearingSource.findFirst({ where: { id: row.sourceId, workspaceId, kind: "document", refId: row.documentId, deletedAt: null } });
    const document = await client.documento.findFirst({ where: { AND: [{ id: row.documentId, causaId }, documentReadWhere(actor)] }, select: { id: true } });
    if (!source || !document) return hiddenClip(row);
    const version = await client.documentEvidenceVersion.findFirst({ where: { resource: { documentoId: row.documentId } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], select: { id: true, extractedText: true, fragments: { orderBy: { ordinal: "asc" }, take: 12, select: { id: true, ordinal: true, text: true } } } });
    if (!version || version.extractedText !== row.text) return hiddenClip(row);
    for (const fragment of version.fragments) await resolveHearingCitation(causaId, workspaceId, { sourceId: row.sourceId, fragmentId: fragment.id, quote: fragment.text.slice(0, 2200) }, actor, client, cache);
    return { ...value, text: row.text, sourceId: row.sourceId, fragments: version.fragments.map(fragment => ({ id: fragment.id, text: fragment.text, locator: `Tramo ${row.sequence + 1} · fragmento ${fragment.ordinal}`, versionId: version.id })), transcriptHref: `/api/causas/${causaId}/hearings/${workspaceId}/live/audio/${session.id}/clips/${row.id}/transcript` };
  } catch (error) { if (isUnavailable(error) || [401, 403].includes(Number((error as { status?: number }).status))) return hiddenClip(row); throw error; }
}
async function detail(causaId: string, workspaceId: string, sessionId: string, user: CausaAccessUser, client: PrismaClient, before?: number): Promise<HearingLiveAudioSessionView> {
  const { actor, session } = await sessionFor(causaId, workspaceId, sessionId, user, client);
  const rows = await client.hearingLiveAudioClip.findMany({ where: { sessionId, ...(before === undefined ? {} : { sequence: { lt: before } }) }, orderBy: { sequence: "desc" }, take: L.page + 1 });
  const visible = rows.slice(0, L.page).reverse(), clips: HearingLiveAudioClipView[] = [], cache = new Map<string, unknown>();
  for (const row of visible) clips.push(await clipView(causaId, workspaceId, session, row, actor, client, cache));
  // No cached content survives a workspace/capability change during object reads.
  await sessionFor(causaId, workspaceId, sessionId, user, client);
  return { ...summary(session, await client.hearingLiveAudioClip.count({ where: { sessionId } })), clips, nextBefore: rows.length > L.page ? visible[0].sequence : null };
}
export async function readHearingLiveAudio(causaId: string, workspaceId: string, user: CausaAccessUser, query: unknown = {}, client: PrismaClient = prisma): Promise<HearingLiveAudioView> {
  const input = liveAudioQuerySchema.parse(query), { actor, canWrite } = await workspaceFor(causaId, workspaceId, user, client);
  const config = await hearingTranscriptionReadiness(client);
  if (!can(actor, "doc.confidential.read")) { config.canCapture = false; config.warnings.push("La captura privada requiere permiso para documentos confidenciales."); }
  const sessions = await client.hearingLiveAudioSession.findMany({ where: { workspaceId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: L.sessions, include: { _count: { select: { clips: true } } } });
  return { config, sessions: sessions.map(row => summary(row, row._count.clips)), ...(input.sessionId ? { session: await detail(causaId, workspaceId, input.sessionId, actor, client, input.before) } : {}), canWrite, maxBytes: L.clipBytes, clipSeconds: L.clipSeconds, maxSessions: L.sessions, maxClips: L.clips, warnings };
}
export async function startHearingLiveAudio(causaId: string, workspaceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma): Promise<HearingLiveAudioMutation> {
  const input = liveAudioStartSchema.parse(raw), { actor } = await workspaceFor(causaId, workspaceId, user, client, true); await captureReady(client, actor);
  const result = await hearingTransaction(client, async tx => {
    const { actor } = await workspaceFor(causaId, workspaceId, user, tx, true);
    const prior = await tx.hearingLiveAudioSession.findUnique({ where: { workspaceId_requestId: { workspaceId, requestId: input.requestId } } });
    if (prior) { if (prior.title !== input.title) throw conflict("Esta petición ya se utilizó con otro título"); return { id: prior.id, reused: true }; }
    if (await tx.hearingLiveAudioSession.count({ where: { workspaceId } }) >= L.sessions) throw httpError("La mesa admite hasta veinte sesiones de captura. Prepare otra mesa para continuar", 413);
    if (await tx.hearingLiveAudioSession.count({ where: { workspaceId, status: "recording" } })) throw conflict("Hay una captura abierta en esta mesa. Ciérrela antes de iniciar otra");
    const session = await tx.hearingLiveAudioSession.create({ data: { workspaceId, requestId: input.requestId, title: input.title } }); await audit(tx, actor.id, session.id, "start"); return { id: session.id, reused: false };
  });
  return { session: await detail(causaId, workspaceId, result.id, actor, client), reused: result.reused };
}
export async function stopHearingLiveAudio(causaId: string, workspaceId: string, sessionId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma): Promise<HearingLiveAudioMutation> {
  liveAudioCommandSchema.parse(raw);
  const reused = await hearingTransaction(client, async tx => { const { actor, session } = await sessionFor(causaId, workspaceId, sessionId, user, tx, true); if (session.status === "stopped") return true; await tx.hearingLiveAudioSession.update({ where: { id: sessionId }, data: { status: "stopped", closedAt: new Date() } }); await audit(tx, actor.id, sessionId, "stop"); return false; });
  return { session: await detail(causaId, workspaceId, sessionId, user, client), reused };
}
async function publishClip(causaId: string, workspaceId: string, sessionId: string, clipId: string, token: string, user: CausaAccessUser, client: PrismaClient) {
  const { actor, session } = await sessionFor(causaId, workspaceId, sessionId, user, client, true), clip = await client.hearingLiveAudioClip.findUniqueOrThrow({ where: { id: clipId } });
  if (!clip.audioId) throw conflict("El original todavía no está confirmado en el Host");
  const { audio } = await readCaseAudio(causaId, clip.audioId, actor, client);
  if (audio.status !== "ready" || !audio.transcriptText?.trim() || audio.transcriptText.length > L.textChars) throw httpError("El transcriptor debe devolver entre 1 y 16000 caracteres por tramo. El original se conserva", 502);
  const text = audio.transcriptText, documentId = `live_transcript_${clip.id}`, storageKey = `live-transcripts/${clip.id}/attempts/${randomUUID()}/${sha256(Buffer.from(text))}`;
  let committed = false;
  try {
    await putObject({ key: storageKey, body: Buffer.from(text), contentType: "text/plain" });
    committed = await hearingTransaction(client, async tx => {
    const { actor } = await sessionFor(causaId, workspaceId, sessionId, user, tx, true), current = await tx.hearingLiveAudioClip.findUniqueOrThrow({ where: { id: clipId } });
    if (current.status === "ready") return false;
    if (current.operationToken !== token || !current.operationLockedAt || Date.now() - current.operationLockedAt.getTime() >= AUDIO_LEASE_MS) throw conflict();
    const stored = await tx.caseAudio.findFirst({ where: { id: clip.audioId!, revision: audio.revision, deletedAt: null, liveSessionId: sessionId, sourceDocument: documentReadWhere(actor) } });
    if (!stored || stored.transcriptSha256 !== sha256(text)) throw conflict("La transcripción o su original cambiaron antes de publicar");
    const name = `Transcripción automática · ${session.title} · tramo ${clip.sequence + 1}.txt`;
    const metadata = { method: "audio-transcript-snapshot", audioId: audio.id, audioSha256: audio.sourceSha256, transcriptSha256: audio.transcriptSha256, revision: audio.revision, reviewStatus: "unreviewed", provider: audio.provider, model: audio.model, speechCorroboration: "human-review-required", liveSessionId: sessionId, sequence: clip.sequence };
    const doc = await tx.documento.create({ data: { id: documentId, nombre: name, tipo: "transcripcion", mimeType: "text/plain", contenido: text, extractedMarkdown: text, extractionStatus: "completed", extractionJson: JSON.stringify(metadata), ruta: `Audiencias/En vivo/${sessionId}/Transcripciones`, causaId, autorId: actor.id, confidencial: true } });
    await tx.caseAudioPublication.create({ data: { audioId: audio.id, documentId: doc.id } });
    await tx.caseAudio.update({ where: { id: audio.id }, data: { transcriptDocumentId: doc.id, revision: { increment: 1 } } });
    await storeEvidenceSnapshot(tx, { documentoId: doc.id, sourceRevision: `${doc.version}:${doc.updatedAt.toISOString()}`, name, mimeType: "text/plain", bytes: Buffer.from(text), text, storageKey, status: "completed", metadata: { locator: "text-offset", ...metadata } });
    const source = await tx.hearingSource.create({ data: { workspaceId, kind: "document", refId: doc.id, liveAudioClipId: clipId, position: clip.sequence, state: "pending" } });
    await tx.hearingWorkspace.update({ where: { id: workspaceId }, data: { revision: { increment: 1 } } });
    await tx.hearingLiveAudioClip.update({ where: { id: clipId }, data: { status: "ready", documentId: doc.id, sourceId: source.id, text, textSha256: sha256(text), operationToken: null, operationLockedAt: null, lastError: null } });
    await audit(tx, actor.id, sessionId, "clip.publish", { clipId, sequence: clip.sequence, audioId: audio.id, documentId: doc.id });
    return true;
    });
  } catch (error) {
    try { await discardLiveTranscriptAttempt(storageKey); } catch (cleanup) { throw Object.assign(new AggregateError([error, cleanup], "No se pudo retirar una publicación temporal; consulte al administrador del almacenamiento"), { status: 503 }); }
    throw error;
  }
  if (!committed) await discardLiveTranscriptAttempt(storageKey);
}
async function processClip(causaId: string, workspaceId: string, sessionId: string, clipId: string, user: CausaAccessUser, client: PrismaClient, attemptId: string, upload?: LiveAudioUpload) {
  const token = randomUUID();
  const claim = await hearingTransaction(client, async tx => {
    await sessionFor(causaId, workspaceId, sessionId, user, tx, true); const row = await tx.hearingLiveAudioClip.findFirst({ where: { id: clipId, sessionId } }); if (!row) throw missing();
    let attempts: string[]; try { attempts = JSON.parse(row.attemptIdsJson); if (!Array.isArray(attempts) || attempts.length > 20 || attempts.some(id => typeof id !== "string")) throw new Error(); } catch { throw conflict("Los recibos del tramo están dañados; conserve el original y consulte al administrador"); }
    if (row.status === "failed" && attempts.includes(attemptId) && !(upload && !row.audioId)) return null;
    if (!attempts.includes(attemptId) && attempts.length >= 20) throw httpError("El tramo alcanzó veinte intentos. Conserve su original y use el gestor de audios para continuar", 413);
    if (row.status === "ready" || row.operationToken && row.operationLockedAt && Date.now() - row.operationLockedAt.getTime() < AUDIO_LEASE_MS) return null;
    await tx.hearingLiveAudioClip.update({ where: { id: row.id }, data: { status: "transcribing", operationToken: token, operationLockedAt: new Date(), attemptIdsJson: JSON.stringify(Array.from(new Set([...attempts, attemptId]))), lastError: null } }); return row;
  });
  if (!claim) return;
  try {
    const { actor, session } = await sessionFor(causaId, workspaceId, sessionId, user, client, true);
    let audioId = claim.audioId;
    if (!audioId) {
      if (!upload) throw conflict("El original no llegó al Host. Reenvíe el mismo tramo pendiente o inicie una nueva captura");
      const result = await uploadHearingLiveAudio(causaId, { workspaceId, sessionId, clipId }, { requestId: `live-${clipId}`, title: `${session.title} · tramo ${claim.sequence + 1}`, name: claim.sourceName, bytes: upload.bytes }, actor, client); audioId = result.audio.id;
      await hearingTransaction(client, async tx => { await sessionFor(causaId, workspaceId, sessionId, user, tx, true); const updated = await tx.hearingLiveAudioClip.updateMany({ where: { id: clipId, operationToken: token }, data: { audioId } }); if (!updated.count) throw conflict(); });
    }
    await captureReady(client, actor);
    const original = await readCaseAudio(causaId, audioId, actor, client);
    if (original.audio.status !== "ready" || !original.audio.transcriptText || original.audio.transcriptText.length > L.textChars) await transcribeCaseAudio(causaId, audioId, { revision: original.audio.revision }, actor, client, async tx => { await sessionFor(causaId, workspaceId, sessionId, user, tx, true); const current = await tx.hearingLiveAudioClip.findUnique({ where: { id: clipId } }); if (current?.operationToken !== token) throw conflict(); });
    await publishClip(causaId, workspaceId, sessionId, clipId, token, actor, client);
  } catch (error) {
    const status = Number((error as { status?: number }).status), message = [400, 409, 413, 415, 422, 502, 503].includes(status) && error instanceof Error ? error.message : "No se pudo completar el tramo. Compruebe los permisos y la conexión; revise si su original llegó al Host";
    await hearingTransaction(client, async tx => { const current = await tx.hearingLiveAudioClip.updateMany({ where: { id: clipId, operationToken: token }, data: { status: "failed", operationToken: null, operationLockedAt: null, lastError: message.slice(0, 500) } }); if (current.count) await audit(tx, user.id, sessionId, "clip.failed", { clipId }); });
    if ([401, 403, 404].includes(status)) throw error;
  }
}
async function mutation(causaId: string, workspaceId: string, sessionId: string, clipId: string, user: CausaAccessUser, client: PrismaClient, reused: boolean): Promise<HearingLiveAudioMutation> {
  const session = await detail(causaId, workspaceId, sessionId, user, client), { actor } = await sessionFor(causaId, workspaceId, sessionId, user, client);
  const row = await client.hearingLiveAudioClip.findUniqueOrThrow({ where: { id: clipId } });
  return { session, clip: session.clips.find(clip => clip.id === clipId) || await clipView(causaId, workspaceId, (await sessionFor(causaId, workspaceId, sessionId, user, client)).session, row, actor, client, new Map()), reused };
}
export async function appendHearingLiveAudioClip(causaId: string, workspaceId: string, sessionId: string, input: LiveAudioUpload, user: CausaAccessUser, client: PrismaClient = prisma): Promise<HearingLiveAudioMutation> {
  validateLiveAudioUpload(input); const sourceSha256 = sha256(input.bytes);
  const result = await hearingTransaction(client, async tx => {
    const { actor, session } = await sessionFor(causaId, workspaceId, sessionId, user, tx, true);
    const prior = await tx.hearingLiveAudioClip.findUnique({ where: { sessionId_requestId: { sessionId, requestId: input.requestId } } });
    if (prior) { if (prior.sequence !== input.sequence || prior.sourceSha256 !== sourceSha256 || prior.sourceName !== input.name || prior.sizeBytes !== input.bytes.length) throw conflict("La misma petición de tramo se utilizó con otro contenido"); return { id: prior.id, reused: true }; }
    if (session.status !== "recording") throw conflict("La captura está cerrada; no se admiten nuevos tramos");
    if (session.nextSequence !== input.sequence) throw conflict("Falta confirmar un tramo anterior; no se alteró el orden de captura");
    if (session.nextSequence >= L.clips || session.totalBytes + input.bytes.length > L.sessionBytes) throw httpError("La sesión alcanzó 360 tramos o 256 MiB. Cierre esta captura y prepare otra", 413);
    const row = await tx.hearingLiveAudioClip.create({ data: { sessionId, requestId: input.requestId, sequence: input.sequence, sourceName: input.name, sourceSha256, sizeBytes: input.bytes.length } });
    await tx.hearingLiveAudioSession.update({ where: { id: sessionId }, data: { nextSequence: { increment: 1 }, totalBytes: { increment: input.bytes.length } } }); await audit(tx, actor.id, sessionId, "clip.reserve", { clipId: row.id, sequence: input.sequence }); return { id: row.id, reused: false };
  });
  await processClip(causaId, workspaceId, sessionId, result.id, user, client, `upload-${input.requestId}`, input); return mutation(causaId, workspaceId, sessionId, result.id, user, client, result.reused);
}
export async function retryHearingLiveAudioClip(causaId: string, workspaceId: string, sessionId: string, clipId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma): Promise<HearingLiveAudioMutation> {
  const command = liveAudioCommandSchema.parse(raw); const { actor } = await sessionFor(causaId, workspaceId, sessionId, user, client, true);
  const clip = await client.hearingLiveAudioClip.findFirst({ where: { id: clipId, sessionId } }); if (!clip) throw missing();
  const reused = clip.status === "ready"; await processClip(causaId, workspaceId, sessionId, clipId, actor, client, `retry-${command.requestId}`); return mutation(causaId, workspaceId, sessionId, clipId, actor, client, reused);
}

export async function readHearingLiveAudioTranscript(causaId: string, workspaceId: string, sessionId: string, clipId: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const { actor, session } = await sessionFor(causaId, workspaceId, sessionId, user, client), row = await client.hearingLiveAudioClip.findFirst({ where: { id: clipId, sessionId } });
  if (!row) throw missing();
  const clip = await clipView(causaId, workspaceId, session, row, actor, client, new Map());
  if (!clip.available || clip.status !== "ready") throw missing();
  await sessionFor(causaId, workspaceId, sessionId, user, client);
  return { text: ["TRANSCRIPCIÓN AUTOMÁTICA SIN REVISIÓN HUMANA", session.title, `Tramo ${row.sequence + 1}`, `Audio LexOpen: ${row.audioId}`, `SHA-256 del audio conservado: ${row.sourceSha256}`, `SHA-256 del texto: ${row.textSha256}`, audioTranscriptNotice, "El orden de los tramos no acredita continuidad ni marcas de tiempo de la audiencia.", "", clip.text, ""].join("\n"), filename: `transcripcion-${clip.id}.txt` };
}
