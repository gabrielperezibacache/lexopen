import { Prisma, type PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { writeAuditStrict } from "@/lib/audit";
import { sha256 } from "@/lib/evidence/fragments";
import { workspaceFor, hearingTransaction, isUnavailable, type HearingClient } from "./access";
import { checkedNote, HEARING_LIMITS } from "./service";
import { resolveHearingCitation, storedHearingCitation } from "./citations";
import { hearingLiveControlSchema, hearingLiveEntrySchema, hearingLivePlanSchema } from "./live-schemas";
import { hearingElapsedSeconds, HEARING_LIVE_MAX_SECONDS } from "./live-time";
import type { HearingLiveEntry, HearingLiveKind, HearingLiveMutation, HearingLivePlan, HearingLiveView } from "./live-types";
import type { HearingNoteView } from "./types";
type State = Prisma.HearingLiveStateGetPayload<Record<string, never>>;
export type HearingLiveClock = () => Date;
export const HEARING_LIVE_ENTRY_PAGE = 30;
const conflict = (message = "El panel cambió en otra sesión. Conserve su texto y vuelva a comprobar la sesión antes de continuar") => Object.assign(httpError(message, 409), { code: "hearing_live_conflict" });
const sourceFailure = () => Object.assign(httpError("Un punto del guion o su respaldo ya no está disponible. Retírelo de la selección o revise sus permisos", 409), { code: "hearing_live_source_unavailable" });
const kindLabels: Record<HearingLiveKind, string> = { observation: "Observación anotada", objection: "Objeción anotada", decision: "Resolución anotada", commitment: "Compromiso anotado" };

function empty(workspaceId: string, now: Date): State {
  return { workspaceId, phase: "idle", elapsedSeconds: 0, runningSince: null, startedAt: null, endedAt: null, opening: "", closing: "", noteIdsJson: "[]", noteRevisionsJson: "{}", addressedNoteIdsJson: "[]", activeNoteId: null, revision: 1, updatedAt: now };
}
function readIds(raw: string): string[] {
  try { const value = JSON.parse(raw); if (!Array.isArray(value) || value.length > 20 || new Set(value).size !== value.length || value.some(id => typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,100}$/.test(id))) throw new Error(); return value; }
  catch { throw sourceFailure(); }
}
function planOf(row: State): HearingLivePlan {
  const noteIds = readIds(row.noteIdsJson), addressedNoteIds = readIds(row.addressedNoteIdsJson);
  let noteRevisions: Record<string, number>;
  try { noteRevisions = JSON.parse(row.noteRevisionsJson); if (!noteRevisions || Array.isArray(noteRevisions) || Object.keys(noteRevisions).length !== noteIds.length || noteIds.some(id => !Number.isSafeInteger(noteRevisions[id]) || noteRevisions[id] < 1)) throw new Error(); } catch { throw sourceFailure(); }
  if (addressedNoteIds.some(id => !noteIds.includes(id)) || row.activeNoteId && !noteIds.includes(row.activeNoteId) || row.opening.length > 8000 || row.closing.length > 8000) throw sourceFailure();
  return { opening: row.opening, closing: row.closing, noteIds, noteRevisions, addressedNoteIds, activeNoteId: row.activeNoteId };
}
async function stateFor(workspaceId: string, tx: HearingClient, now: Date) { return await tx.hearingLiveState.findUnique({ where: { workspaceId } }) || empty(workspaceId, now); }
async function checkedOrStub(causaId: string, workspaceId: string, id: string, actor: CausaAccessUser, tx: HearingClient, cache: Map<string, unknown>): Promise<HearingNoteView> {
  try { return (await checkedNote(causaId, workspaceId, id, actor, tx, cache)).view; }
  catch (error) { if (!isUnavailable(error)) throw error; return { id, available: false }; }
}
async function view(causaId: string, workspaceId: string, user: CausaAccessUser, tx: HearingClient, now: Date, before?: string): Promise<HearingLiveView> {
  const { actor, row: workspace, canWrite } = await workspaceFor(causaId, workspaceId, user, tx);
  const state = await stateFor(workspaceId, tx, now), plan = planOf(state), cache = new Map<string, unknown>();
  if (!["idle", "running", "paused", "finished"].includes(state.phase)) throw sourceFailure();
  const noteRows = await tx.hearingNote.findMany({ where: { workspaceId }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: HEARING_LIMITS.notes + 1, select: { id: true } });
  const notes: HearingNoteView[] = [];
  for (const note of noteRows.slice(0, HEARING_LIMITS.notes)) notes.push(await checkedOrStub(causaId, workspaceId, note.id, actor, tx, cache));
  // A selected point deleted since the plan was saved remains an anonymous stub.
  for (const id of plan.noteIds) if (!notes.some(note => note.id === id)) notes.push({ id, available: false });
  const changedNoteIds = plan.noteIds.filter(id => { const note = notes.find(note => note.id === id); return note?.available && note.revision !== plan.noteRevisions[id]; });
  plan.addressedNoteIds = plan.addressedNoteIds.filter(id => !changedNoteIds.includes(id) && notes.some(note => note.id === id && note.available));
  if (plan.activeNoteId && (changedNoteIds.includes(plan.activeNoteId) || !notes.some(note => note.id === plan.activeNoteId && note.available))) plan.activeNoteId = null;
  if (before && !await tx.hearingNote.count({ where: { id: before, workspaceId, liveKind: { not: null } } })) throw httpError("La página de registros ya no está disponible", 404);
  const rows = await tx.hearingNote.findMany({ where: { workspaceId, liveKind: { not: null } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...(before ? { cursor: { id: before }, skip: 1 } : {}), take: HEARING_LIVE_ENTRY_PAGE + 1, select: { id: true, liveKind: true, liveElapsedSeconds: true, createdAt: true } });
  const entries: HearingLiveEntry[] = [];
  for (const row of rows.slice(0, HEARING_LIVE_ENTRY_PAGE).reverse()) {
    const note = notes.find(note => note.id === row.id) || await checkedOrStub(causaId, workspaceId, row.id, actor, tx, cache);
    entries.push(note.available && row.liveKind && row.liveKind in kindLabels && Number.isInteger(row.liveElapsedSeconds) && row.liveElapsedSeconds! >= 0 && row.liveElapsedSeconds! <= HEARING_LIVE_MAX_SECONDS ? { ...note, kind: row.liveKind as HearingLiveKind, elapsedSeconds: row.liveElapsedSeconds!, createdAt: row.createdAt.toISOString() } : { id: row.id, available: false });
  }
  const elapsedSeconds = hearingElapsedSeconds(state, now);
  return { workspaceId, workspaceRevision: workspace.revision, workspaceStatus: workspace.status as HearingLiveView["workspaceStatus"], revision: state.revision, phase: state.phase as HearingLiveView["phase"], elapsedSeconds, runningSince: state.runningSince?.toISOString() || null, startedAt: state.startedAt?.toISOString() || null, endedAt: state.endedAt?.toISOString() || null, serverNow: now.toISOString(), plan, changedNoteIds, notes, entries, nextBefore: rows.length > HEARING_LIVE_ENTRY_PAGE ? rows[HEARING_LIVE_ENTRY_PAGE - 1].id : null, canWrite, limited: noteRows.length > HEARING_LIMITS.notes || rows.length > HEARING_LIVE_ENTRY_PAGE,
    warnings: ["Tiempo de trabajo registrado por el profesional; no acredita duración judicial ni calcula plazos legales.", "La apertura, el cierre y los registros son observaciones propias. El cotejo de una cita no certifica esas observaciones.", ...(changedNoteIds.length ? ["Hay puntos modificados desde que se preparó el guion. Su marca de tratado y su selección activa se suspenden hasta revisar la nueva versión."] : []), ...(notes.some(note => !note.available) ? ["Hay puntos no disponibles. Sus títulos, texto y citas permanecen ocultos."] : []), ...(elapsedSeconds >= HEARING_LIVE_MAX_SECONDS ? ["El contador alcanzó su límite de siete días; el tiempo mostrado está acotado."] : [])] };
}
export async function readHearingLive(causaId: string, workspaceId: string, user: CausaAccessUser, query: { before?: string } = {}, client: PrismaClient = prisma, clock: HearingLiveClock = () => new Date()) {
  if (query.before && !/^[a-zA-Z0-9_-]{1,100}$/.test(query.before)) throw httpError("Página de registros inválida", 400);
  return hearingTransaction(client, tx => view(causaId, workspaceId, user, tx, clock(), query.before));
}
export async function readHearingLiveForExport(causaId: string, workspaceId: string, user: CausaAccessUser, client: PrismaClient = prisma, clock: HearingLiveClock = () => new Date()) {
  return hearingTransaction(client, async tx => {
    const { actor, row } = await workspaceFor(causaId, workspaceId, user, tx);
    const live = await view(causaId, workspaceId, actor, tx, clock());
    const metadata = await tx.hearingNote.findMany({ where: { workspaceId, liveKind: { not: null } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: HEARING_LIMITS.notes + 1, select: { id: true, liveKind: true, liveElapsedSeconds: true, createdAt: true } });
    live.entries = metadata.slice(0, HEARING_LIMITS.notes).map(row => {
      const note = live.notes.find(note => note.id === row.id);
      return note?.available && row.liveKind && row.liveKind in kindLabels && Number.isInteger(row.liveElapsedSeconds) && row.liveElapsedSeconds! >= 0 && row.liveElapsedSeconds! <= HEARING_LIVE_MAX_SECONDS ? { ...note, kind: row.liveKind as HearingLiveKind, elapsedSeconds: row.liveElapsedSeconds!, createdAt: row.createdAt.toISOString() } : { id: row.id, available: false };
    });
    live.nextBefore = null; live.limited = metadata.length > HEARING_LIMITS.notes;
    const causa = await tx.causa.findUniqueOrThrow({ where: { id: causaId }, select: { id: true, titulo: true, rit: true } });
    return { live, title: row.title, causa };
  });
}
function hash(action: string, input: unknown) { return sha256(JSON.stringify({ action, input })); }
async function prior(tx: HearingClient, workspaceId: string, requestId: string, inputSha256: string) {
  const previous = await tx.hearingLiveRequest.findUnique({ where: { workspaceId_requestId: { workspaceId, requestId } } });
  if (previous && previous.inputSha256 !== inputSha256) throw conflict("La misma petición ya se utilizó con otro contenido. Vuelva a comprobar la sesión");
  return previous;
}
async function receipt(tx: HearingClient, workspaceId: string, requestId: string, inputSha256: string, revision: number, noteId?: string) { await tx.hearingLiveRequest.create({ data: { workspaceId, requestId, inputSha256, resultingRevision: revision, resultNoteId: noteId || null } }); }
async function update(tx: HearingClient, state: State, data: Prisma.HearingLiveStateUpdateManyMutationInput) {
  const result = await tx.hearingLiveState.updateMany({ where: { workspaceId: state.workspaceId, revision: state.revision }, data: { ...data, revision: { increment: 1 } } });
  if (result.count !== 1) throw conflict();
}
async function stateForWrite(workspaceId: string, tx: HearingClient) { return tx.hearingLiveState.upsert({ where: { workspaceId }, create: { workspaceId }, update: {} }); }
async function audit(tx: HearingClient, actor: CausaAccessUser, workspaceId: string, revision: number, action: string, noteId?: string) { await writeAuditStrict({ actorId: actor.id, action: `hearing.live.${action}`, entityType: "HearingWorkspace", entityId: workspaceId, after: { revision, ...(noteId ? { noteId } : {}) } }, tx); }

export async function saveHearingLivePlan(causaId: string, workspaceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma, clock: HearingLiveClock = () => new Date()): Promise<HearingLiveMutation> {
  const input = hearingLivePlanSchema.parse(raw), inputSha256 = hash("plan", input);
  return hearingTransaction(client, async tx => {
    const { actor } = await workspaceFor(causaId, workspaceId, user, tx, true), now = clock();
    if (await prior(tx, workspaceId, input.requestId, inputSha256)) return { live: await view(causaId, workspaceId, actor, tx, now), reused: true };
    const state = await stateForWrite(workspaceId, tx);
    if (state.revision !== input.expectedRevision) throw conflict();
    try { const cache = new Map<string, unknown>(); for (const id of input.noteIds) { const note = await checkedNote(causaId, workspaceId, id, actor, tx, cache); if (note.view.revision !== input.noteRevisions[id]) throw conflict("Un punto cambió desde su última lectura. Revise la nueva versión antes de confirmar el guion"); } }
    catch (error) { if ((error as { code?: string }).code === "hearing_live_conflict") throw error; if (isUnavailable(error)) throw sourceFailure(); throw error; }
    const next = { opening: input.opening, closing: input.closing, noteIdsJson: JSON.stringify(input.noteIds), noteRevisionsJson: JSON.stringify(Object.fromEntries(input.noteIds.map(id => [id, input.noteRevisions[id]]))), addressedNoteIdsJson: JSON.stringify(input.addressedNoteIds), activeNoteId: input.activeNoteId };
    const changed = Object.entries(next).some(([key, value]) => state[key as keyof State] !== value);
    if (changed) { await update(tx, state, next); await audit(tx, actor, workspaceId, state.revision + 1, "plan"); }
    await receipt(tx, workspaceId, input.requestId, inputSha256, state.revision + Number(changed));
    return { live: await view(causaId, workspaceId, actor, tx, now), reused: false };
  });
}
export async function controlHearingLive(causaId: string, workspaceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma, clock: HearingLiveClock = () => new Date()): Promise<HearingLiveMutation> {
  const input = hearingLiveControlSchema.parse(raw), inputSha256 = hash("control", input);
  return hearingTransaction(client, async tx => {
    const { actor, row: workspace } = await workspaceFor(causaId, workspaceId, user, tx, true), now = clock();
    if (await prior(tx, workspaceId, input.requestId, inputSha256)) return { live: await view(causaId, workspaceId, actor, tx, now), reused: true };
    const state = await stateForWrite(workspaceId, tx);
    if (state.revision !== input.expectedRevision) throw conflict();
    let phase = state.phase;
    if (input.action === "start") { if (!["idle", "running"].includes(phase)) throw conflict("Para continuar una sesión pausada o finalizada, use Reanudar"); phase = "running"; }
    if (input.action === "resume") { if (phase === "idle") throw conflict("Inicie la sesión antes de reanudarla"); phase = "running"; }
    if (input.action === "pause") { if (!["running", "paused"].includes(phase)) throw conflict("Sólo puede pausarse una sesión iniciada"); phase = "paused"; }
    if (input.action === "finish") { if (phase === "idle") throw conflict("Inicie la sesión antes de finalizarla"); phase = "finished"; }
    const workspaceStatus = phase === "finished" ? "closed" : "live";
    const changed = phase !== state.phase || workspace.status !== workspaceStatus;
    if (changed) {
      await update(tx, state, { phase, elapsedSeconds: hearingElapsedSeconds(state, now), runningSince: phase === "running" ? now : null, startedAt: state.startedAt || now, endedAt: phase === "finished" ? (state.phase === "finished" ? state.endedAt : now) : null });
      await tx.hearingWorkspace.update({ where: { id: workspaceId }, data: { status: workspaceStatus, revision: { increment: 1 } } });
      await audit(tx, actor, workspaceId, state.revision + 1, input.action);
    }
    await receipt(tx, workspaceId, input.requestId, inputSha256, state.revision + Number(changed));
    return { live: await view(causaId, workspaceId, actor, tx, now), reused: false };
  });
}
export async function createHearingLiveEntry(causaId: string, workspaceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma, clock: HearingLiveClock = () => new Date()): Promise<HearingLiveMutation> {
  const input = hearingLiveEntrySchema.parse(raw), inputSha256 = hash("entry", input);
  return hearingTransaction(client, async tx => {
    const { actor } = await workspaceFor(causaId, workspaceId, user, tx, true), now = clock();
    const previous = await prior(tx, workspaceId, input.requestId, inputSha256);
    if (previous) return { live: await view(causaId, workspaceId, actor, tx, now), reused: true, ...(previous.resultNoteId ? { note: await checkedOrStub(causaId, workspaceId, previous.resultNoteId, actor, tx, new Map()) } : {}) };
    const state = await stateForWrite(workspaceId, tx);
    if (state.revision !== input.expectedRevision) throw conflict();
    if (await tx.hearingNote.count({ where: { workspaceId } }) >= HEARING_LIMITS.notes) throw httpError("La mesa admite hasta 100 notas y registros en total. Conserve una copia y prepare otra mesa para ampliar el alcance", 413);
    let citation = null;
    try { citation = input.citation ? await resolveHearingCitation(causaId, workspaceId, input.citation, actor, tx) : null; }
    catch (error) { if (isUnavailable(error)) throw sourceFailure(); throw error; }
    const elapsedSeconds = hearingElapsedSeconds(state, now);
    const row = await tx.hearingNote.create({ data: { workspaceId, title: `${kindLabels[input.kind]} · ${input.title}`.slice(0, 180), body: input.body, liveKind: input.kind, liveElapsedSeconds: elapsedSeconds, sourceId: citation?.sourceId || null, citationJson: citation ? JSON.stringify(storedHearingCitation(citation)) : "" } });
    await update(tx, state, {}); await receipt(tx, workspaceId, input.requestId, inputSha256, state.revision + 1, row.id); await audit(tx, actor, workspaceId, state.revision + 1, "entry", row.id);
    return { live: await view(causaId, workspaceId, actor, tx, now), reused: false, note: (await checkedNote(causaId, workspaceId, row.id, actor, tx)).view };
  });
}
