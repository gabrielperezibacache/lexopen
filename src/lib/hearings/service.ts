import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import type { CausaAccessUser } from "@/lib/auth/causa-access";
import { writeAuditStrict } from "@/lib/audit";
import { sha256 } from "@/lib/evidence/fragments";
import { hearingActor, hearingTransaction, workspaceFor, changed, unavailable, isUnavailable, type HearingClient } from "./access";
import { listSourceOptions, readHearingSource, sourceFor, sourceOption, sourceView } from "./sources";
import { resolveHearingCitation, verifyHearingCitation, storedHearingCitation, citationText } from "./citations";
import { hearingBriefSchema, hearingCreateSchema, hearingPatchSchema, hearingSourceSchema, hearingSourcePatchSchema, hearingDeleteSchema, hearingNoteSchema, hearingNotePatchSchema, hearingVerifySchema } from "./schemas";
import { renderHearingBrief } from "./brief";
import type { HearingCitationStored, HearingLibraryView, HearingNoteView, HearingWorkspaceSummary, HearingWorkspaceView } from "./types";
import { checkedTurn, listCheckedTurns } from "./chat";
import { hearingElapsedSeconds } from "./live-time";
export const HEARING_LIMITS = { workspaces: 100, sources: 200, notes: 100, turns: 40 } as const;
export const summary = (row: { id: string; title: string; scheduledFor: Date | null; status: string; revision: number; updatedAt: Date }): HearingWorkspaceSummary => ({ id: row.id, title: row.title, scheduledFor: row.scheduledFor?.toISOString() || null, status: row.status as HearingWorkspaceSummary["status"], revision: row.revision, updatedAt: row.updatedAt.toISOString() });
export async function listHearings(causaId: string, user: CausaAccessUser, client: PrismaClient = prisma): Promise<HearingLibraryView> {
  const { actor, canWrite } = await hearingActor(causaId, user, client), rows = await client.hearingWorkspace.findMany({ where: { causaId, ownerId: actor.id }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: HEARING_LIMITS.workspaces + 1 });
  const { options, limited } = await listSourceOptions(causaId, actor, client);
  await hearingActor(causaId, actor, client);
  return { workspaces: rows.slice(0, HEARING_LIMITS.workspaces).map(summary), options, canWrite, limited: limited || rows.length > HEARING_LIMITS.workspaces };
}
export async function createHearing(causaId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = hearingCreateSchema.parse(raw);
  return hearingTransaction(client, async tx => {
    const { actor } = await hearingActor(causaId, user, tx, true);
    if (await tx.hearingWorkspace.count({ where: { causaId, ownerId: actor.id } }) >= HEARING_LIMITS.workspaces) throw httpError("Esta causa admite hasta 100 mesas privadas por profesional", 413);
    const row = await tx.hearingWorkspace.create({ data: { causaId, ownerId: actor.id, title: input.title, scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null } });
    await writeAuditStrict({ actorId: actor.id, action: "hearing.workspace.create", entityType: "HearingWorkspace", entityId: row.id, after: { causaId, revision: row.revision } }, tx);
    return summary(row);
  });
}
export async function updateHearing(causaId: string, workspaceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = hearingPatchSchema.parse(raw);
  return hearingTransaction(client, async tx => {
    const { actor, row } = await workspaceFor(causaId, workspaceId, user, tx, true);
    if (row.revision !== input.revision) throw changed();
    const result = await tx.hearingWorkspace.updateMany({ where: { id: row.id, revision: input.revision, ownerId: actor.id }, data: { title: input.title, scheduledFor: input.scheduledFor ? new Date(input.scheduledFor) : null, status: input.status, agendaText: input.agendaText, revision: { increment: 1 } } });
    if (result.count !== 1) throw changed();
    if (input.status !== "live") {
      const live = await tx.hearingLiveState.findUnique({ where: { workspaceId } });
      const phase = input.status === "closed" ? "finished" : "paused";
      if (live && live.phase !== "idle" && (live.phase === "running" || input.status === "closed" && live.phase !== "finished")) {
        const now = new Date();
        await tx.hearingLiveState.update({ where: { workspaceId }, data: { phase, elapsedSeconds: hearingElapsedSeconds(live, now), runningSince: null, endedAt: phase === "finished" ? now : null, revision: { increment: 1 } } });
        await writeAuditStrict({ actorId: actor.id, action: "hearing.live.status_sync", entityType: "HearingWorkspace", entityId: workspaceId, after: { revision: live.revision + 1, phase } }, tx);
      }
    }
    await writeAuditStrict({ actorId: actor.id, action: "hearing.workspace.update", entityType: "HearingWorkspace", entityId: row.id, before: { revision: row.revision }, after: { revision: row.revision + 1, status: input.status } }, tx);
    return summary(await tx.hearingWorkspace.findUniqueOrThrow({ where: { id: row.id } }));
  });
}
export async function attachHearingSource(causaId: string, workspaceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = hearingSourceSchema.parse(raw);
  return hearingTransaction(client, async tx => {
    const { actor } = await workspaceFor(causaId, workspaceId, user, tx, true), option = await sourceOption(causaId, input.kind, input.refId, actor, tx);
    const prior = await tx.hearingSource.findUnique({ where: { workspaceId_kind_refId: { workspaceId, ...input } } });
    if (prior && !prior.deletedAt) return sourceView(prior, option);
    if (await tx.hearingSource.count({ where: { workspaceId, deletedAt: null } }) >= HEARING_LIMITS.sources) throw httpError("La mesa admite hasta 200 fuentes", 413);
    const row = prior ? await tx.hearingSource.update({ where: { id: prior.id }, data: { deletedAt: null, state: "pending", locationJson: "{}", position: await tx.hearingSource.count({ where: { workspaceId, deletedAt: null } }), revision: { increment: 1 } } }) : await tx.hearingSource.create({ data: { workspaceId, ...input, position: await tx.hearingSource.count({ where: { workspaceId, deletedAt: null } }) } });
    await writeAuditStrict({ actorId: actor.id, action: "hearing.source.attach", entityType: "HearingSource", entityId: row.id, after: { workspaceId, kind: row.kind, refId: row.refId, revision: row.revision } }, tx);
    return sourceView(row, option);
  });
}
export async function updateHearingSource(causaId: string, workspaceId: string, sourceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = hearingSourcePatchSchema.parse(raw);
  // Validate locators against a real currently authorized reader before persisting a bookmark.
  if (Object.keys(input.location).length) await readHearingSource(causaId, workspaceId, sourceId, user, input.location, client);
  return hearingTransaction(client, async tx => {
    const { actor } = await workspaceFor(causaId, workspaceId, user, tx, true), { row, option } = await sourceFor(causaId, workspaceId, sourceId, actor, tx);
    if (row.revision !== input.revision) throw changed();
    if (input.position !== row.position) {
      const peers = await tx.hearingSource.findMany({ where: { workspaceId, deletedAt: null, position: input.position, NOT: { id: row.id } }, select: { id: true, revision: true } });
      for (const peer of peers) {
        await tx.hearingSource.update({ where: { id: peer.id }, data: { position: row.position, revision: { increment: 1 } } });
        await writeAuditStrict({ actorId: actor.id, action: "hearing.source.reorder", entityType: "HearingSource", entityId: peer.id, before: { revision: peer.revision, position: input.position }, after: { revision: peer.revision + 1, position: row.position } }, tx);
      }
    }
    const result = await tx.hearingSource.updateMany({ where: { id: row.id, workspaceId, deletedAt: null, revision: input.revision }, data: { state: input.state, position: input.position, locationJson: JSON.stringify(input.location), revision: { increment: 1 } } });
    if (result.count !== 1) throw changed();
    await writeAuditStrict({ actorId: actor.id, action: "hearing.source.update", entityType: "HearingSource", entityId: row.id, before: { revision: row.revision }, after: { revision: row.revision + 1, state: input.state, position: input.position } }, tx);
    return sourceView(await tx.hearingSource.findUniqueOrThrow({ where: { id: row.id } }), option);
  });
}
export async function deleteHearingSource(causaId: string, workspaceId: string, sourceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = hearingDeleteSchema.parse(raw);
  return hearingTransaction(client, async tx => {
    const { actor } = await workspaceFor(causaId, workspaceId, user, tx, true), result = await tx.hearingSource.updateMany({ where: { id: sourceId, workspaceId, deletedAt: null, revision: input.revision }, data: { deletedAt: new Date(), revision: { increment: 1 } } });
    if (result.count !== 1) throw changed();
    await writeAuditStrict({ actorId: actor.id, action: "hearing.source.remove", entityType: "HearingSource", entityId: sourceId, before: { revision: input.revision }, after: { revision: input.revision + 1 } }, tx);
    return { deleted: true };
  });
}
type NoteRow = Prisma.HearingNoteGetPayload<Record<string, never>>;
export async function checkedNote(causaId: string, workspaceId: string, noteId: string, actor: CausaAccessUser, client: HearingClient, cache = new Map<string, unknown>()) {
  const row = await client.hearingNote.findFirst({ where: { id: noteId, workspaceId } }); if (!row) throw unavailable();
  let citation = null;
  if (row.sourceId || row.citationJson) {
    let stored: HearingCitationStored; try { stored = JSON.parse(row.citationJson); } catch { throw unavailable(); }
    if (!row.sourceId || stored.sourceId !== row.sourceId) throw unavailable();
    citation = await verifyHearingCitation(causaId, workspaceId, stored, actor, client, cache);
  }
  const view: Extract<HearingNoteView, { available: true }> = { id: row.id, available: true, sourceId: row.sourceId, title: row.title, body: row.body, revision: row.revision, updatedAt: row.updatedAt.toISOString(), citation };
  return { row, view };
}
async function noteData(causaId: string, workspaceId: string, input: { title: string; body: string; citation: { sourceId: string; fragmentId: string; quote: string } | null }, actor: CausaAccessUser, client: HearingClient) {
  const citation = input.citation ? await resolveHearingCitation(causaId, workspaceId, input.citation, actor, client) : null;
  return { title: input.title, body: input.body, sourceId: citation?.sourceId || null, citationJson: citation ? JSON.stringify(storedHearingCitation(citation)) : "" };
}
export async function createHearingNote(causaId: string, workspaceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = hearingNoteSchema.parse(raw);
  return hearingTransaction(client, async tx => {
    const { actor } = await workspaceFor(causaId, workspaceId, user, tx, true);
    if (await tx.hearingNote.count({ where: { workspaceId } }) >= HEARING_LIMITS.notes) throw httpError("La mesa admite hasta 100 notas", 413);
    const data = await noteData(causaId, workspaceId, input, actor, tx), row = await tx.hearingNote.create({ data: { workspaceId, ...data } });
    await writeAuditStrict({ actorId: actor.id, action: "hearing.note.create", entityType: "HearingNote", entityId: row.id, after: { workspaceId, revision: row.revision, sourceId: row.sourceId } }, tx);
    return (await checkedNote(causaId, workspaceId, row.id, actor, tx)).view;
  });
}
export async function updateHearingNote(causaId: string, workspaceId: string, noteId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = hearingNotePatchSchema.parse(raw);
  return hearingTransaction(client, async tx => {
    const { actor } = await workspaceFor(causaId, workspaceId, user, tx, true), { row } = await checkedNote(causaId, workspaceId, noteId, actor, tx);
    if (row.revision !== input.revision) throw changed();
    const data = await noteData(causaId, workspaceId, input, actor, tx), result = await tx.hearingNote.updateMany({ where: { id: row.id, workspaceId, revision: input.revision }, data: { ...data, revision: { increment: 1 } } });
    if (result.count !== 1) throw changed();
    await writeAuditStrict({ actorId: actor.id, action: "hearing.note.update", entityType: "HearingNote", entityId: row.id, before: { revision: row.revision }, after: { revision: row.revision + 1, sourceId: data.sourceId } }, tx);
    return (await checkedNote(causaId, workspaceId, row.id, actor, tx)).view;
  });
}
export async function deleteHearingNote(causaId: string, workspaceId: string, noteId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = hearingDeleteSchema.parse(raw);
  return hearingTransaction(client, async tx => {
    const { actor } = await workspaceFor(causaId, workspaceId, user, tx, true), result = await tx.hearingNote.deleteMany({ where: { id: noteId, workspaceId, revision: input.revision } });
    if (result.count !== 1) throw changed();
    await writeAuditStrict({ actorId: actor.id, action: "hearing.note.remove", entityType: "HearingNote", entityId: noteId, before: { revision: input.revision } }, tx);
    return { deleted: true };
  });
}
export async function readHearing(causaId: string, workspaceId: string, user: CausaAccessUser, client: PrismaClient = prisma): Promise<HearingWorkspaceView> {
  return hearingTransaction(client, async tx => {
    const { actor, row, canWrite } = await workspaceFor(causaId, workspaceId, user, tx), sources = [], notes: HearingNoteView[] = [], cache = new Map<string, unknown>();
    const sourceRows = await tx.hearingSource.findMany({ where: { workspaceId, deletedAt: null }, orderBy: [{ position: "asc" }, { id: "asc" }], take: HEARING_LIMITS.sources });
    for (const source of sourceRows) { try { const option = await sourceOption(causaId, source.kind as "document" | "site_file" | "book" | "legal", source.refId, actor, tx); sources.push(sourceView(source, option)); } catch (error) { if (!isUnavailable(error)) throw error; sources.push({ id: source.id, available: false as const }); } }
    const noteRows = await tx.hearingNote.findMany({ where: { workspaceId }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: HEARING_LIMITS.notes, select: { id: true } });
    for (const note of noteRows) { try { notes.push((await checkedNote(causaId, workspaceId, note.id, actor, tx, cache)).view); } catch (error) { if (!isUnavailable(error)) throw error; notes.push({ id: note.id, available: false }); } }
    const { turns, limited } = await listCheckedTurns(causaId, workspaceId, actor, tx, cache);
    return { ...summary(row), causaId, agendaText: row.agendaText, canWrite, sources, notes, turns, limited };
  });
}
export async function verifyHearingMaterial(causaId: string, workspaceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = hearingVerifySchema.parse(raw);
  return hearingTransaction(client, async tx => {
    const { actor } = await workspaceFor(causaId, workspaceId, user, tx);
    if ("citation" in input) { const citation = await resolveHearingCitation(causaId, workspaceId, input.citation, actor, tx); return { text: citationText(citation), citations: [citation] }; }
    if ("noteId" in input) { const { view } = await checkedNote(causaId, workspaceId, input.noteId, actor, tx); return { text: `${view.title}\n\n${view.body}${view.citation ? `\n\n${citationText(view.citation)}` : "\n\nNota personal sin corroboración como fuente."}`, citations: view.citation ? [view.citation] : [] }; }
    const turn = await checkedTurn(causaId, workspaceId, input.turnId, actor, tx); return { text: `${turn.question}\n\n${turn.responseText}\n\n${turn.citations.map(citationText).join("\n\n")}\n\nPropuesta para revisión humana; el cotejo de un pasaje no confirma el razonamiento ni la vigencia jurídica.`, citations: turn.citations };
  });
}
export async function exportHearing(causaId: string, workspaceId: string, user: CausaAccessUser, client: PrismaClient = prisma) {
  const view = await readHearing(causaId, workspaceId, user, client);
  // Export only currently available content; unavailable stubs reveal neither titles nor quotes.
  return { name: "mesa-audiencia.txt", text: [view.title, view.scheduledFor ? `Programada: ${view.scheduledFor}` : "", `Estado: ${view.status}`, view.agendaText && `Agenda\n${view.agendaText}`, "Dossier de lectura", ...view.sources.map(source => source.available ? `${source.title} · ${source.state}\n${source.href}` : "Material no disponible"), "Notas personales", ...view.notes.map(note => note.available ? `${note.title}\n${note.body}${note.citation ? `\n${citationText(note.citation)}` : "\nNota personal sin corroboración como fuente."}` : "Material no disponible"), "Conversación con fuentes", ...view.turns.map(turn => turn.available ? `${turn.question}\n${turn.responseText}\n${turn.citations.map(citationText).join("\n\n")}` : "Material no disponible"), "La corroboración permite volver al pasaje conservado. Revise el razonamiento y la vigencia antes de usarlo."].filter(Boolean).join("\n\n") };
}
export async function exportHearingBrief(causaId: string, workspaceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma) {
  const input = hearingBriefSchema.parse(raw);
  return hearingTransaction(client, async tx => {
    const { actor, row } = await workspaceFor(causaId, workspaceId, user, tx);
    const notes: Extract<HearingNoteView, { available: true }>[] = [], cache = new Map<string, unknown>();
    for (const selected of input.notes) {
      // Never accept note bodies or citations supplied by the browser. Revoked, changed,
      // deleted or foreign notes stop the whole export rather than silently dropping a point.
      const { view } = await checkedNote(causaId, workspaceId, selected.id, actor, tx, cache);
      if (view.revision !== selected.revision) throw changed();
      notes.push(view);
    }
    await workspaceFor(causaId, workspaceId, actor, tx);
    return renderHearingBrief(row.title, notes, input);
  });
}
// Private note bindings invalidate derived conversations when a note changes or disappears.
export const noteBinding = (row: NoteRow) => ({ id: row.id, revision: row.revision, bodySha256: sha256(`${row.title}\n${row.body}\n${row.citationJson}`) });
