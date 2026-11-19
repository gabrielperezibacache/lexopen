import type { Prisma } from "@prisma/client";
import { currentStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { assertCausaCapability, causaAccessWhere, assertCausaAccess } from "@/lib/auth/causa-access";
import { can } from "@/lib/auth/permissions";
import { httpError } from "@/lib/auth/access";
import { executeCommand, serializable } from "@/lib/command-execution";
import { writeAuditStrict } from "@/lib/audit";
import { listWindow, listCursorWhere, readListCursor } from "@/lib/api/list-window";
import { retainSupportDocument, supportDocument } from "@/lib/evidence/retained-document";
import { getObjectBounded } from "@/lib/storage";
import { documentBodyForDownload } from "@/lib/security/download";
import { sha256 } from "@/lib/evidence/fragments";
import { santiagoDateKey, civilDateKey } from "@/lib/chile-time";
import { fiscaliaDetailAction } from "./contract";

async function requestFor(id: string, user: StaffActor, tx: Prisma.TransactionClient, write = false) {
  const actor = await currentStaffActor(user, tx);
  const row = await tx.fiscaliaRequest.findFirst({
    where: { id, causa: causaAccessWhere(actor) },
    include: { causa: { select: { id: true, titulo: true, ruc: true } } },
  });
  if (!row) throw httpError("Solicitud no encontrada o sin acceso", 404);
  const access = write ? await assertCausaCapability(row.causaId, actor, "causa.write", tx) : await assertCausaAccess(row.causaId, actor, { auditOverride: false }, tx);
  return { row, actor, canEdit: can(actor, "causa.write", { causaRol: access.causaRol }) };
}

export async function readFiscaliaDetail(id: string, user: StaffActor, after?: string) {
  if (after !== undefined && !readListCursor(after)) throw httpError("Página de historial no válida", 400);
  return serializable(async tx => {
    const { row, actor, canEdit } = await requestFor(id, user, tx);
    const events = await tx.fiscaliaRequestEvent.findMany({
      where: { requestId: id, ...listCursorWhere(after, "createdAt") },
      include: { actor: { select: { name: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 26,
    });
    const window = listWindow(events, 25, "createdAt");
    const history = [];
    for (const event of window.items) {
      let document: { name: string; version: number; href: string } | null = null;
      if (event.documentoId && event.documentVersion) {
        try {
          const { revision } = await supportDocument(row, { kind: "document", documentoId: event.documentoId, version: event.documentVersion }, actor, tx, true);
          document = { name: revision.nombre, version: revision.version, href: `/api/fiscalia/solicitudes/${id}/events/${event.id}/document` };
        } catch (error) {
          if (![403, 404, 409].includes((error as { status?: number }).status || 0)) throw error;
        }
      }
      history.push({ id: event.id, status: event.status, action: event.action, actorName: event.actor?.name || "Usuario anterior", at: event.createdAt.toISOString(),
        evidenceKind: event.evidenceKind, document, correctionReason: event.correctionReason, previousFolio: event.previousFolio, correctedFolio: event.correctedFolio,
        previousSubmittedAt: event.previousSubmittedAt && civilDateKey(event.previousSubmittedAt), correctedSubmittedAt: event.correctedSubmittedAt && civilDateKey(event.correctedSubmittedAt) });
    }
    return { row, canEdit, history, next: window.next };
  });
}

export async function changeFiscaliaDetail(id: string, user: StaffActor, raw: unknown, key: string) {
  const input = fiscaliaDetailAction.parse(raw);
  return executeCommand<{ eventId: string }>({ key, ownerId: user.id, input: { id, ...input },
    authorize: async (tx, committed) => {
      const { row, actor } = await requestFor(id, user, tx, true);
      if (input.action === "attach") await supportDocument(row, { kind: "document", documentoId: input.documentoId, version: input.version }, actor, tx, Boolean(committed));
    },
    run: async tx => {
      const { row, actor } = await requestFor(id, user, tx, true);
      if (row.updatedAt.toISOString() !== input.expectedUpdatedAt) throw httpError("La solicitud cambió. Revise la ficha actualizada.", 409);
      if (!["submitted", "answered", "closed"].includes(row.status)) throw httpError("Registre primero la presentación en Mi Fiscalía.", 409);
      const updatedAt = new Date(Math.max(Date.now(), row.updatedAt.getTime() + 1));
      let event: Prisma.FiscaliaRequestEventUncheckedCreateInput = { requestId: id, actorId: actor.id, status: row.status, action: input.action, createdAt: updatedAt };
      if (input.action === "correct") {
        if (input.submittedAt > santiagoDateKey(new Date()) || row.answeredAt && input.submittedAt > civilDateKey(row.answeredAt) || row.followUpDate && input.submittedAt > civilDateKey(row.followUpDate)) throw httpError("Compruebe la fecha de presentación respecto de hoy, el seguimiento y la respuesta.", 422);
        const submittedAt = new Date(`${input.submittedAt}T00:00:00Z`);
        if (row.folio === input.folio && row.submittedAt?.getTime() === submittedAt.getTime()) throw httpError("El folio y la fecha ya coinciden con los registrados.", 422);
        event = { ...event, correctionReason: input.reason, previousFolio: row.folio, correctedFolio: input.folio, previousSubmittedAt: row.submittedAt, correctedSubmittedAt: submittedAt };
        await tx.fiscaliaRequest.update({ where: { id, updatedAt: row.updatedAt }, data: { updatedAt, folio: input.folio, submittedAt } });
      } else {
        if (input.evidenceKind === "answer" && (!row.answeredAt || !row.responseText)) throw httpError("Registre la respuesta y su fecha antes de adjuntar su respaldo.", 422);
        const document = await retainSupportDocument(row, { kind: "document", documentoId: input.documentoId, version: input.version }, actor, tx);
        event = { ...event, evidenceKind: input.evidenceKind, ...document };
        await tx.fiscaliaRequest.update({ where: { id, updatedAt: row.updatedAt }, data: { updatedAt } });
      }
      const saved = await tx.fiscaliaRequestEvent.create({ data: event });
      await writeAuditStrict({ actorId: actor.id, action: `fiscalia.request.${input.action}`, entityType: "FiscaliaRequest", entityId: id, after: { causaId: row.causaId, eventId: saved.id } }, tx);
      return { eventId: saved.id };
    },
  });
}

export async function fiscaliaEvidenceBytes(id: string, eventId: string, user: StaffActor) {
  return serializable(async tx => {
    const { row, actor } = await requestFor(id, user, tx);
    const event = await tx.fiscaliaRequestEvent.findFirst({ where: { id: eventId, requestId: id } });
    if (!event?.documentoId || !event.documentVersion || !event.documentSha256) throw httpError("Respaldo no disponible", 404);
    const { revision } = await supportDocument(row, { kind: "document", documentoId: event.documentoId, version: event.documentVersion }, actor, tx, true);
    const bytes = documentBodyForDownload(revision, revision.storageKey ? await getObjectBounded(revision.storageKey) : null);
    if (!bytes || sha256(bytes) !== event.documentSha256) throw httpError("El contenido conservado no coincide con el respaldo registrado.", 409);
    return { bytes, name: revision.nombre, mimeType: revision.mimeType };
  });
}
