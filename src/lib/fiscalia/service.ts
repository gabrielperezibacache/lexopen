import { prisma } from "@/lib/db";
import { type Prisma } from "@prisma/client";
import { assertCausaAccess, assertCausaCapability, causaAccessWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { currentStaffActor } from "@/lib/auth/staff-actor";
import { can } from "@/lib/auth/permissions";
import { httpError } from "@/lib/auth/access";
import { executeCommand } from "@/lib/command-execution";
import { writeAuditStrict } from "@/lib/audit";
import { fiscaliaFields, fiscaliaUpdate, fiscaliaValidation, type FiscaliaInput, type FiscaliaState } from "./contract";
import { civilDateKey } from "@/lib/chile-time";

const causeSelect = (userId: string) => ({ id: true, titulo: true, ruc: true, abogadoId: true, miembros: { where: { userId, desde: { lte: new Date() }, OR: [{ hasta: null }, { hasta: { gt: new Date() } }] }, select: { rol: true }, take: 1 } }) satisfies Prisma.CausaSelect;
function fields(input: FiscaliaInput) {
  const date = (value: string | null) => value ? new Date(`${value}T00:00:00.000Z`) : null;
  return { title: input.title, kind: input.kind, body: input.body, ruc: input.ruc || null, status: input.status,
    folio: input.folio || null, submittedAt: date(input.submittedAt), responseText: input.responseText,
    answeredAt: date(input.answeredAt), followUpDate: date(input.followUpDate) };
}
export async function fiscaliaWorkspace(user: CausaAccessUser, filters: { causaId?: string; status?: string } = {}) {
  const actor = await currentStaffActor(user, prisma);
  if (filters.causaId) await assertCausaAccess(filters.causaId, actor, { auditOverride: false });
  const [causes, rows] = await Promise.all([
    prisma.causa.findMany({ where: causaAccessWhere(actor), select: causeSelect(actor.id), orderBy: [{ titulo: "asc" }, { id: "asc" }] }),
    prisma.fiscaliaRequest.findMany({
      where: { causa: causaAccessWhere(actor), ...(filters.causaId ? { causaId: filters.causaId } : {}),
        ...(filters.status === "all" ? {} : filters.status && filters.status !== "open" ? { status: filters.status } : { status: { notIn: ["closed", "cancelled"] } }) },
      include: { causa: { select: causeSelect(actor.id) }, events: { orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 15, include: { actor: { select: { name: true } } } } },
      orderBy: [{ followUpDate: { sort: "asc", nulls: "last" } }, { updatedAt: "desc" }, { id: "asc" }], take: 101,
    }),
  ]);
  const editable = (cause: typeof causes[number]) => can(actor, "causa.write", { causaRol: cause.abogadoId === actor.id ? "responsable" : cause.miembros[0]?.rol });
  return { causes: causes.map(c => ({ id: c.id, titulo: c.titulo, ruc: c.ruc, canEdit: editable(c) })),
    rows: rows.slice(0, 100).map(r => ({ ...r, causa: { id: r.causa.id, titulo: r.causa.titulo }, canEdit: editable(r.causa) })), truncated: rows.length > 100 };
}
export async function saveFiscaliaRequest(user: CausaAccessUser, raw: unknown, key: string, update = false) {
  const patch = update ? fiscaliaUpdate.parse(raw) : null;
  const input = patch ?? fiscaliaFields.parse(raw);
  return executeCommand<{ id: string }>({ key, ownerId: user.id, input,
    authorize: async tx => {
      const actor = await currentStaffActor(user, tx);
      if (patch) {
        const row = await tx.fiscaliaRequest.findFirst({ where: { id: patch.id, causa: causaAccessWhere(actor) }, select: { causaId: true } });
        if (!row) throw httpError("Solicitud no encontrada o sin acceso", 404);
        if (row.causaId !== input.causaId) throw httpError("No se puede trasladar una solicitud a otra causa", 400);
      }
      await assertCausaCapability(input.causaId, actor, "causa.write", tx);
    },
    run: async tx => {
      const previous = patch ? await tx.fiscaliaRequest.findUniqueOrThrow({ where: { id: patch.id } }) : null;
      if (previous && previous.updatedAt.toISOString() !== patch!.expectedUpdatedAt) throw httpError("La solicitud cambió. Actualice antes de guardarla.", 409);
      const error = fiscaliaValidation(input, previous ? previous.status as FiscaliaState : null);
      if (error) throw httpError(error, 400);
      if (previous && ["submitted", "answered", "closed"].includes(previous.status) &&
          ["title", "kind", "body", "ruc"].some(field => (previous[field as "title" | "kind" | "body" | "ruc"] || "") !== (input[field as "title" | "kind" | "body" | "ruc"] || ""))) throw httpError("El contenido presentado se conserva. Cree otra solicitud para una nueva gestión.", 409);
      if (previous && ["answered", "closed"].includes(previous.status) && (input.responseText !== previous.responseText || input.answeredAt !== (previous.answeredAt ? civilDateKey(previous.answeredAt) : null))) throw httpError("La respuesta registrada se conserva en su historial.", 409);
      const record = previous ? await tx.fiscaliaRequest.update({ where: { id: previous.id }, data: { ...fields(input), updatedAt: new Date(Math.max(Date.now(), previous.updatedAt.getTime() + 1)) } })
        : await tx.fiscaliaRequest.create({ data: { causaId: input.causaId, creatorId: user.id, ...fields(input) } });
      await tx.fiscaliaRequestEvent.create({ data: { requestId: record.id, actorId: user.id, status: record.status, action: previous ? "updated" : "created" } });
      await writeAuditStrict({ actorId: user.id, action: previous ? "fiscalia.request.update" : "fiscalia.request.create", entityType: "FiscaliaRequest", entityId: record.id,
        before: previous ? { status: previous.status } : undefined, after: { causaId: record.causaId, status: record.status, source: "manual" } }, tx);
      return { id: record.id };
    },
  });
}

export async function exportFiscaliaRequest(id: string, user: CausaAccessUser) {
  const actor = await currentStaffActor(user, prisma);
  const row = await prisma.fiscaliaRequest.findFirst({ where: { id, causa: causaAccessWhere(actor) }, include: { causa: { select: { titulo: true } } } });
  if (!row) throw httpError("Solicitud no encontrada o sin acceso", 404);
  return `Mi Fiscalía · preparación y seguimiento local\nEste archivo no es un comprobante oficial de presentación.\n\nCausa: ${row.causa.titulo}\nRUC: ${row.ruc || "Por confirmar"}\nAsunto: ${row.title}\n\n${row.body}\n\nFolio registrado por el usuario: ${row.folio || "Sin registrar"}\n\nRespuesta registrada:\n${row.responseText || "Sin respuesta registrada"}\n`;
}
