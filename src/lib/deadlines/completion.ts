import type { Plazo, PlazoStateEvent, Prisma } from "@prisma/client";
import { currentStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import {
  assertCausaAccess,
  assertCausaCapability,
  documentReadWhere,
  plazoAccessWhere,
} from "@/lib/auth/causa-access";
import { can } from "@/lib/auth/permissions";
import { httpError } from "@/lib/auth/access";
import { canonicalJson } from "@/lib/command-execution";
import { sha256 } from "@/lib/evidence/fragments";
import { getObjectBounded } from "@/lib/storage";
import { writeAuditStrict } from "@/lib/audit";
import { completionSupportSchema, type CompletionSupport } from "./schemas";
type Tx = Prisma.TransactionClient;
export const deadlineVersion = (row: Plazo) =>
  sha256(
    canonicalJson(
      Object.fromEntries(
        (
          [
            "id",
            "stateRevision",
            "titulo",
            "descripcion",
            "fechaLimite",
            "fechaNotificacion",
            "diasPlazo",
            "calculationCountry",
            "calculationRegime",
            "tipoComputo",
            "esFatal",
            "tipo",
            "estado",
            "alertaEnviada",
            "createdAt",
            "updatedAt",
            "causaId",
            "responsableId",
          ] as const
        ).map((key) => [key, row[key]]),
      ),
    ),
  );
export async function deadlineFor(
  id: string,
  user: StaffActor,
  tx: Tx,
  state?: string,
) {
  const actor = await currentStaffActor(user, tx);
  const row = await tx.plazo.findFirst({
    where: { id, ...plazoAccessWhere(actor) },
  });
  if (!row) throw httpError("Plazo no encontrado", 404);
  const sources = await tx.minutaAccion.findMany({
    where: { plazoId: row.id },
    select: { minuta: { select: { causaId: true } } },
  });
  for (const source of sources)
    await assertCausaAccess(
      source.minuta.causaId,
      actor,
      { auditOverride: false },
      tx,
    );
  if (state)
    for (const capability of state === "cumplido"
      ? (["plazo.edit", "plazo.close"] as const)
      : (["plazo.edit"] as const)) {
      if (row.causaId) {
        const access = await assertCausaCapability(
          row.causaId,
          actor,
          capability,
          tx,
        );
        if (access.causaRol === "lectura" && !can(actor, "causa.write"))
          throw httpError("La causa sólo permite lectura", 403);
      } else if (
        !can(actor, capability, { own: row.responsableId === actor.id })
      )
        throw httpError("Sin permiso para modificar este plazo", 403);
    }
  return { actor, row };
}
async function supportDocument(
  plazo: Pick<Plazo, "causaId">,
  support: Extract<CompletionSupport, { kind: "document" }>,
  user: StaffActor,
  tx: Tx,
  retained = false,
) {
  const actor = await currentStaffActor(user, tx);
  const doc = await tx.documento.findFirst({
    where: { id: support.documentoId, ...documentReadWhere(actor) },
  });
  if (!doc || doc.causaId !== plazo.causaId)
    throw httpError(
      "El respaldo no está disponible en el ámbito del plazo",
      404,
    );
  if (!retained && doc.version !== support.version)
    throw httpError("El documento cambió; seleccione su versión actual", 409);
  const old = retained
    ? await tx.offlineDocumentRevision.findUnique({
        where: {
          documentoId_version: {
            documentoId: doc.id,
            version: support.version,
          },
        },
      })
    : null;
  if (retained && (!old || old.causaId !== plazo.causaId))
    throw httpError("La versión del respaldo ya no está disponible", 404);
  const flags = old || doc;
  if (flags.confidencial && !can(actor, "doc.confidential.read"))
    throw httpError("Respaldo no disponible", 404);
  if (flags.privilegio) {
    const cause = doc.causaId
      ? await tx.causa.findUnique({
          where: { id: doc.causaId },
          select: { abogadoId: true },
        })
      : null;
    const member = doc.causaId
      ? await tx.causaMiembro.findFirst({
          where: {
            causaId: doc.causaId,
            userId: actor.id,
            desde: { lte: new Date() },
            OR: [{ hasta: null }, { hasta: { gt: new Date() } }],
          },
          select: { id: true },
        })
      : null;
    if (
      !can(actor, "doc.confidential.read") ||
      !can(actor, "doc.privileged.read", {
        own:
          doc.autorId === actor.id ||
          cause?.abogadoId === actor.id ||
          Boolean(member),
      })
    )
      throw httpError("Respaldo no disponible", 404);
  }
  return { doc, revision: old || doc };
}
export async function authorizeCompletion(
  plazo: Pick<Plazo, "causaId">,
  support: CompletionSupport | undefined,
  user: StaffActor,
  tx: Tx,
  retained = false,
) {
  if (support?.kind === "document")
    await supportDocument(plazo, support, user, tx, retained);
}
/** Called inside the caller's receipt transaction after the domain update. */
export async function recordDeadlineTransition(
  before: Plazo | null,
  after: Plazo,
  user: StaffActor,
  raw: CompletionSupport | undefined,
  tx: Tx,
  origin: string,
  inheritedConfidential = false,
): Promise<Plazo> {
  if (
    before?.estado === after.estado ||
    (!before && after.estado !== "cumplido")
  )
    return after;
  const { actor } = await deadlineFor(after.id, user, tx, after.estado);
  let data: {
    supportKind?: string;
    justification?: string;
    documentoId?: string;
    documentVersion?: number;
    documentSha256?: string;
  } = {};
  if (after.estado === "cumplido") {
    const parsed = completionSupportSchema.safeParse(raw);
    if (!parsed.success)
      throw httpError(
        "Para cumplir el plazo, vincule un documento o registre una justificación manual",
        422,
      );
    const support = parsed.data;
    if (support.kind === "manual")
      data = { supportKind: "manual", justification: support.justification };
    else {
      const { doc } = await supportDocument(after, support, actor, tx);
      if (!doc.storageKey && doc.contenido === null)
        throw httpError("El original del respaldo no está disponible", 409);
      const bytes = doc.storageKey
        ? await getObjectBounded(doc.storageKey)
        : Buffer.from(doc.contenido || "", "utf8");
      if (!bytes)
        throw httpError("El original del respaldo no está disponible", 409);
      const retained = await tx.offlineDocumentRevision.findUnique({
        where: {
          documentoId_version: { documentoId: doc.id, version: doc.version },
        },
      });
      if (retained) {
        const retainedBytes = retained.storageKey
          ? await getObjectBounded(retained.storageKey)
          : retained.contenido !== null
            ? Buffer.from(retained.contenido, "utf8")
            : null;
        if (!retainedBytes || sha256(retainedBytes) !== sha256(bytes))
          throw httpError(
            "La versión retenida del documento no coincide con el original",
            409,
          );
      }
      await tx.offlineDocumentRevision.upsert({
        where: {
          documentoId_version: { documentoId: doc.id, version: doc.version },
        },
        update: {},
        create: {
          documentoId: doc.id,
          version: doc.version,
          contenido: doc.contenido,
          storageKey: doc.storageKey,
          mimeType: doc.mimeType,
          nombre: doc.nombre,
          confidencial: doc.confidencial,
          privilegio: doc.privilegio,
          causaId: doc.causaId,
          snapshotJson: canonicalJson(doc),
        },
      });
      data = {
        supportKind: "document",
        documentoId: doc.id,
        documentVersion: doc.version,
        documentSha256: sha256(bytes),
      };
    }
  }
  const current = await tx.plazo.update({
    where: { id: after.id, updatedAt: after.updatedAt },
    data: {
      stateRevision: { increment: 1 },
      ...(after.estado === "pendiente" ? { alertaEnviada: false } : {}),
    },
  });
  const author = await tx.user.findUniqueOrThrow({
    where: { id: actor.id },
    select: { name: true },
  });
  const event = await tx.plazoStateEvent.create({
    data: {
      plazoId: after.id,
      revision: current.stateRevision,
      fromEstado: before?.estado ?? null,
      toEstado: after.estado,
      actorId: actor.id,
      actorName: author.name,
      origin,
      scopeCausaId: after.causaId,
      confidential:
        inheritedConfidential ||
        Boolean(
          await tx.minutaAccion.findFirst({
            where: { plazoId: after.id, minuta: { confidencial: true } },
            select: { id: true },
          }),
        ),
      ...data,
    },
  });
  await writeAuditStrict(
    {
      actorId: actor.id,
      action: "plazo.state.record",
      entityType: "PlazoStateEvent",
      entityId: event.id,
      after: {
        plazoId: after.id,
        revision: event.revision,
        fromEstado: event.fromEstado,
        toEstado: event.toEstado,
        supportKind: event.supportKind,
      },
    },
    tx,
  );
  return current;
}
export async function eventDocument(
  row: Plazo,
  event: PlazoStateEvent,
  user: StaffActor,
  tx: Tx,
) {
  if (
    event.scopeCausaId !== row.causaId ||
    (event.confidential &&
      !can(await currentStaffActor(user, tx), "doc.confidential.read"))
  )
    throw httpError("Respaldo no disponible", 404);
  if (!event.documentoId || !event.documentVersion)
    throw httpError("No hay documento asociado", 404);
  return supportDocument(
    row,
    {
      kind: "document",
      documentoId: event.documentoId,
      version: event.documentVersion,
    },
    user,
    tx,
    true,
  );
}
export async function readDeadlineHistory(
  id: string,
  user: StaffActor,
  tx: Tx,
  after?: string,
) {
  const { row, actor } = await deadlineFor(id, user, tx);
  const cursor = after && /^\d+$/.test(after) ? Number(after) : null;
  if (
    after &&
    (!cursor || !Number.isSafeInteger(cursor) || cursor > 2147483647)
  )
    throw httpError("Cursor de historial inválido", 400);
  const events = await tx.plazoStateEvent.findMany({
    where: { plazoId: id, ...(cursor ? { revision: { lt: cursor } } : {}) },
    orderBy: { revision: "desc" },
    take: 51,
  });
  const visible = [];
  for (const event of events.slice(0, 50)) {
    let available = !event.confidential || can(actor, "doc.confidential.read");
    if (event.scopeCausaId) {
      try {
        await assertCausaAccess(
          event.scopeCausaId,
          actor,
          { auditOverride: false },
          tx,
        );
      } catch (e) {
        if (![403, 404].includes((e as { status?: number }).status || 0))
          throw e;
        available = false;
      }
    }
    let document: { name: string; href: string; version: number } | null = null;
    if (available && event.supportKind === "document") {
      try {
        const { revision } = await eventDocument(row, event, actor, tx);
        document = {
          name: revision.nombre,
          version: event.documentVersion!,
          href: `/api/plazos/${id}/events/${event.id}/document`,
        };
      } catch (e) {
        if (![403, 404, 409].includes((e as { status?: number }).status || 0))
          throw e;
      }
    }
    visible.push({
      id: event.id,
      revision: event.revision,
      fromEstado: event.fromEstado,
      toEstado: event.toEstado,
      actor: available ? event.actorName : "Registro no disponible",
      createdAt: event.createdAt.toISOString(),
      supportKind: event.supportKind,
      justification: available ? event.justification : null,
      document,
      documentUnavailable: event.supportKind === "document" && !document,
    });
  }
  return {
    version: deadlineVersion(row),
    estado: row.estado,
    legacy:
      row.estado === "cumplido" &&
      !(await tx.plazoStateEvent.findFirst({
        where: { plazoId: id, toEstado: "cumplido" },
      })),
    events: visible,
    next: events.length > 50 ? String(events[49].revision) : null,
  };
}

export async function authorizeDeadlineEvent(
  id: string,
  revision: number,
  user: StaffActor,
  tx: Tx,
) {
  const { row } = await deadlineFor(id, user, tx);
  const event = await tx.plazoStateEvent.findUnique({
    where: { plazoId_revision: { plazoId: id, revision } },
  });
  if (!event) throw httpError("Comprobante de cumplimiento no disponible", 409);
  if (event.supportKind === "document")
    await eventDocument(row, event, user, tx);
}
