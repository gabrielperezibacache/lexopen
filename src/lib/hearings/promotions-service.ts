import type { PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertCausaAccess, assertCausaCapability, type CausaAccessUser } from "@/lib/auth/causa-access";
import { can } from "@/lib/auth/permissions";
import { httpError } from "@/lib/auth/access";
import { writeAuditStrict } from "@/lib/audit";
import { sha256 } from "@/lib/evidence/fragments";
import { createCaseFact, readCaseFact } from "@/lib/knowledge/cases";
import { createCaseWritingFromSource, readCaseWriting } from "@/lib/writings/service";
import { hearingTransaction, workspaceFor, type HearingClient } from "./access";
import { checkedNote, createHearingNote } from "./service";
import { hearingPromotionPreviewSchema, hearingPromotionSchema } from "./promotions-schemas";
import type { HearingPromotionPreview, HearingPromotionResult, HearingPromotionTarget } from "./promotions-types";

const conflict = () => Object.assign(httpError("El registro cambió desde su revisión. Vuelva a abrir la conversión antes de confirmar", 409), { code: "hearing_live_promotion_conflict" });
const ownNotice = "Conversión revisada por el profesional desde una anotación de audiencia. El cotejo del pasaje no acredita por sí mismo toda la afirmación ni una actuación judicial.";
function sourceWarnings(row: { revision: number; liveKind: string | null; liveElapsedSeconds: number | null }, warning: string | null, cited: boolean) {
  return [...new Set([ownNotice, ...(row.liveKind ? [`Origen: registro personal en vivo, revisión ${row.revision}.`] : ["Origen: nota personal de la mesa de audiencia."]), ...(row.liveElapsedSeconds !== null ? [`Tiempo del control de sesión: ${row.liveElapsedSeconds} segundos; no es una marca de tiempo del audio.`] : []), ...(warning ? [warning] : []), ...(!cited ? ["Observación personal sin pasaje documental asociado. No contiene una cita verificada."] : [])])];
}
function href(causaId: string, workspaceId: string, target: HearingPromotionTarget, id: string) {
  if (target === "writing") return `/causas/${causaId}/escritos?draft=${encodeURIComponent(id)}`;
  if (target === "fact") return `/causas/${causaId}#conocimiento`;
  return `/causas/${causaId}/audiencias?mesa=${encodeURIComponent(workspaceId)}&nota=${encodeURIComponent(id)}#note-${id}`;
}
async function source(causaId: string, workspaceId: string, noteId: string, actor: CausaAccessUser, client: HearingClient): Promise<{ preview: HearingPromotionPreview; row: Awaited<ReturnType<typeof checkedNote>>["row"] }> {
  const { row, view } = await checkedNote(causaId, workspaceId, noteId, actor, client);
  const access = await assertCausaAccess(causaId, actor, { auditOverride: false }, client), canDraft = can(actor, "escrito.draft", { causaRol: access.causaRol });
  const reason = !view.citation ? "Para proponer un hecho necesita un pasaje documental corroborado. Esta observación puede convertirse en nota o borrador, sin presentarla como acreditada." : view.citation.origin === "book" ? "Los hechos del expediente utilizan pasajes de documentos o transcripciones publicados. Conserve este respaldo bibliográfico en una nota o un escrito." : null;
  return { row, preview: { source: view, targets: { fact: { available: !reason, reason }, note: { available: true, reason: null }, writing: { available: canDraft, reason: canDraft ? null : "No tiene permiso para redactar escritos en esta causa." } }, warnings: sourceWarnings(row, view.citation?.warning || null, Boolean(view.citation)) } };
}
export async function previewHearingPromotion(causaId: string, workspaceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma): Promise<HearingPromotionPreview> {
  const input = hearingPromotionPreviewSchema.parse(raw);
  return hearingTransaction(client, async tx => {
    const { actor } = await workspaceFor(causaId, workspaceId, user, tx, true);
    const current = await source(causaId, workspaceId, input.noteId, actor, tx);
    if (current.row.revision !== input.revision) throw conflict();
    return current.preview;
  });
}
/** One atomic conversion; destination records keep their existing access and citation rules. */
export async function promoteHearingRecord(causaId: string, workspaceId: string, raw: unknown, user: CausaAccessUser, client: PrismaClient = prisma): Promise<HearingPromotionResult> {
  const input = hearingPromotionSchema.parse(raw), inputSha256 = sha256(JSON.stringify({ action: "hearing-promotion", input }));
  return hearingTransaction(client, async tx => {
    const { actor } = await workspaceFor(causaId, workspaceId, user, tx, true);
    // Source access is checked even for a previously committed request.
    const current = await source(causaId, workspaceId, input.source.noteId, actor, tx), warnings = current.preview.warnings;
    if (input.target === "writing") await assertCausaCapability(causaId, actor, "escrito.draft", tx);
    const previous = await tx.hearingLivePromotion.findUnique({ where: { workspaceId_requestId: { workspaceId, requestId: input.requestId } } });
    if (previous) {
      if (previous.inputSha256 !== inputSha256 || previous.sourceNoteId !== input.source.noteId || previous.targetKind !== input.target) throw conflict();
      // Deleted or newly restricted destinations are never recreated by a replay.
      if (input.target === "writing") await readCaseWriting(causaId, previous.targetId, actor, tx);
      else if (input.target === "fact") await readCaseFact(causaId, previous.targetId, actor, tx);
      else await checkedNote(causaId, workspaceId, previous.targetId, actor, tx);
      return { target: input.target, id: previous.targetId, href: href(causaId, workspaceId, input.target, previous.targetId), reused: true, warnings };
    }
    if (current.row.revision !== input.source.revision) throw conflict();
    let id: string;
    if (input.target === "fact") {
      const citation = current.preview.source.citation;
      if (!citation || citation.origin !== "knowledge") throw httpError(current.preview.targets.fact.reason || "Seleccione un respaldo documental", 422);
      const created = await createCaseFact(causaId, actor, { statement: input.body, citations: [{ kind: citation.snapshot.kind, fragmentId: citation.snapshot.fragmentId, quote: citation.quote }] }, tx);
      id = created.fact.id;
      if (!created.reused) {
        const stored = await tx.caseFact.findUniqueOrThrow({ where: { id }, select: { metadataJson: true } });
        const metadata = JSON.parse(stored.metadataJson);
        await tx.caseFact.update({ where: { id }, data: { origin: "hearing_live", metadataJson: JSON.stringify({ ...metadata, warnings: [...new Set([...(metadata.warnings || []), ...warnings])], hearingOrigin: { workspaceId, noteId: current.row.id, revision: current.row.revision, kind: current.row.liveKind, elapsedSeconds: current.row.liveElapsedSeconds } }) } });
      } else warnings.push("El hecho ya existía: conserva su estado y revisiones anteriores; esta conversión no lo vuelve a aprobar.");
    } else if (input.target === "note") {
      const citation = current.preview.source.citation;
      const provenance = `Origen: nota de audiencia «${current.row.title}», revisión ${current.row.revision}.${current.row.liveElapsedSeconds !== null ? ` Tiempo del control de sesión: ${current.row.liveElapsedSeconds} segundos; no es una marca de audio.` : ""}`;
      const body = `${input.body}\n\n${provenance}`;
      if (body.length > 20_000) throw httpError("Reduzca el texto para conservar también la procedencia dentro del límite de 20.000 caracteres", 413);
      const note = await createHearingNote(causaId, workspaceId, { title: input.title, body, citation: citation ? { sourceId: citation.sourceId, fragmentId: citation.snapshot.fragmentId, quote: citation.quote } : null }, actor, tx);
      id = note.id;
    } else {
      const created = await createCaseWritingFromSource(causaId, { requestId: input.requestId, title: input.title, body: input.body, source: { kind: "note", workspaceId, noteId: current.row.id, revision: current.row.revision } }, actor, tx);
      id = created.draft.id;
    }
    await tx.hearingLivePromotion.create({ data: { workspaceId, requestId: input.requestId, inputSha256, sourceNoteId: current.row.id, sourceRevision: current.row.revision, targetKind: input.target, targetId: id } });
    await writeAuditStrict({ actorId: actor.id, action: "hearing.live.promote", entityType: "HearingWorkspace", entityId: workspaceId, after: { sourceNoteId: current.row.id, sourceRevision: current.row.revision, sourceSha256: sha256(`${current.row.title}\n${current.row.body}\n${current.row.citationJson}`), targetKind: input.target, targetId: id } }, tx);
    return { target: input.target, id, href: href(causaId, workspaceId, input.target, id), reused: false, warnings };
  });
}
