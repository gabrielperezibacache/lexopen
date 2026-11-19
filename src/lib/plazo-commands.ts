import { currentStaffActor } from "@/lib/auth/staff-actor";
import { z } from "zod";
import { plazoCreateSchema } from "@/lib/schemas";
import { httpError } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { STAFF_ROLES } from "@/lib/auth/roles";
import {
  assertCausaAccess,
  assertCausaCapability,
  type CausaAccessUser,
} from "@/lib/auth/causa-access";
import { executeCommand } from "@/lib/command-execution";
import { writeAuditStrict } from "@/lib/audit";
import { civilDateKey } from "@/lib/chile-time";
import { calcularVencimientoYmd } from "@/lib/plazos";
import { calculateCivilDeadline, civilEdition } from "@/lib/deadlines/civil-profile";
import { parseDateInput } from "@/lib/date-input";
import {
  requireDeadlineComputation,
  deadlineCalculation,
} from "@/lib/plazos-policy";

export { deadlineStateSchema as plazoStateSchema } from "@/lib/deadlines/schemas";
import { deadlineStateSchema as plazoStateSchema } from "@/lib/deadlines/schemas";
import {
  deadlineFor,
  deadlineVersion,
  recordDeadlineTransition,
  authorizeDeadlineEvent,
} from "@/lib/deadlines/completion";

export async function createPlazoCommand(
  user: CausaAccessUser,
  body: z.infer<typeof plazoCreateSchema>,
  commandKey: string,
) {
  body = plazoCreateSchema.parse(body);
  const fechaNotificacion = body.fechaNotificacion
    ? parseDateInput(body.fechaNotificacion)
    : null;
  const explicitDate = body.fechaLimite
    ? parseDateInput(body.fechaLimite)
    : null;
  if (body.calculationProfile === "manual" && !explicitDate)
    throw httpError("Indique la fecha límite revisada.", 422);
  if (body.calculationProfile === "civil" && body.tipo && body.tipo !== "procesal")
    throw httpError("El perfil civil solo cubre términos procesales individuales.", 422);
  if (body.calculationProfile === "civil" && (explicitDate || body.tipoComputo))
    throw httpError("El perfil civil requiere calcular la fecha desde la notificación. Para ingresar una fecha revisada, seleccione registro manual.", 422);
  if (body.calculationProfile === "internal" && (!body.fechaNotificacion || !body.diasPlazo || explicitDate))
    throw httpError("La estimación interna requiere fecha de inicio y duración.", 422);
  if (!explicitDate && !body.diasPlazo)
    throw httpError("Indique fechaLimite o diasPlazo", 400);
  return executeCommand({
    key: commandKey,
    ownerId: user.id,
    input: body,
    authorize: async (tx) => {
      const actor = await currentStaffActor(user, tx);
      if (body.causaId) {
        const access = await assertCausaCapability(
          body.causaId,
          actor,
          "plazo.edit",
          tx,
        );
        if (access.causaRol === "lectura" && !can(actor, "causa.write"))
          throw httpError("La causa sólo permite lectura", 403);
      } else if (
        !can(actor, "plazo.edit", {
          own: !body.responsableId || body.responsableId === user.id,
        })
      )
        throw httpError("Sin permiso para crear este plazo", 403);
      if (body.responsableId) {
        const target = await tx.user.findFirst({
          where: { id: body.responsableId, role: { in: [...STAFF_ROLES] } },
        });
        if (!target) throw httpError("Responsable no válido", 400);
        if (body.causaId)
          await assertCausaAccess(body.causaId, target, undefined, tx);
      }
    },
    run: async (tx) => {
      if (!explicitDate) await requireDeadlineComputation(tx);
      const civil = body.calculationProfile === "civil" ? calculateCivilDeadline({
        notice: body.fechaNotificacion, days: body.diasPlazo,
        notificationConfirmed: body.notificationConfirmed, scopeConfirmed: body.civilScopeConfirmed,
      }) : null;
      const fechaLimite =
        explicitDate || (civil && new Date(civil.date)) ||
        new Date(
          `${calcularVencimientoYmd({ desde: civilDateKey(fechaNotificacion || new Date()), dias: body.diasPlazo!, tipoComputo: body.tipoComputo || "habiles" })}T00:00:00.000Z`,
        );
      const plazo = await tx.plazo.create({
        data: {
          ...(civil ? { calculationCountry: "CL", calculationRegime: civilEdition.id, civilCalculationBasis: { ...civil.basis, causaId: body.causaId || null, confirmedById: user.id } }
            : !explicitDate ? deadlineCalculation : {}),
          titulo: body.titulo,
          descripcion: body.descripcion || null,
          fechaLimite,
          fechaNotificacion: civil ? new Date(civil.basis.start) : fechaNotificacion,
          diasPlazo: body.diasPlazo || null,
          tipoComputo: body.tipoComputo || "habiles",
          esFatal: Boolean(body.esFatal),
          tipo: body.tipo || "procesal",
          estado: "pendiente",
          causaId: body.causaId || null,
          responsableId: body.responsableId || user.id,
        },
      });
      if (plazo.causaId)
        await tx.activity.create({
          data: {
            tipo: "plazo",
            mensaje: `Plazo${plazo.esFatal ? " fatal" : ""}: ${plazo.titulo} (${civilDateKey(plazo.fechaLimite)})`,
            causaId: plazo.causaId,
            userId: user.id,
          },
        });
      await writeAuditStrict(
        {
          actorId: user.id,
          action: "plazo.create",
          entityType: "Plazo",
          entityId: plazo.id,
          after: plazo,
        },
        tx,
      );
      return plazo;
    },
  });
}

export async function updateDeadlineStateInTransaction(
  user: CausaAccessUser,
  input: z.infer<typeof plazoStateSchema>,
  tx: import("@prisma/client").Prisma.TransactionClient,
  origin = "plazos",
) {
  const { actor, row: before } = await deadlineFor(
    input.id,
    user,
    tx,
    input.estado,
  );
  if (before.estado === input.estado) return before;
  if (!input.expectedVersion)
    throw httpError("Recargue el plazo antes de cambiar su estado", 422);
  if (deadlineVersion(before) !== input.expectedVersion)
    throw httpError(
      "El plazo cambió en otra sesión. Compare las versiones antes de continuar.",
      409,
    );
  let updated = await tx.plazo.update({
    where: { id: before.id, updatedAt: before.updatedAt },
    data: { estado: input.estado },
  });
  updated = await recordDeadlineTransition(
    before,
    updated,
    actor,
    input.completion,
    tx,
    origin,
  );
  await writeAuditStrict(
    {
      actorId: actor.id,
      action: "plazo.update",
      entityType: "Plazo",
      entityId: updated.id,
      before: { estado: before.estado },
      after: { estado: updated.estado, stateRevision: updated.stateRevision },
    },
    tx,
  );
  return updated;
}
export async function updatePlazoCommand(
  user: CausaAccessUser,
  raw: z.infer<typeof plazoStateSchema>,
  commandKey: string,
) {
  const body = plazoStateSchema.parse(raw);
  return executeCommand<import("@prisma/client").Plazo>({
    key: commandKey,
    ownerId: user.id,
    input: body,
    authorize: async (tx, committed) => {
      await deadlineFor(body.id, user, tx, body.estado);
      if (
        committed &&
        body.estado === "cumplido" &&
        committed.stateRevision > 1
      )
        await authorizeDeadlineEvent(
          body.id,
          committed.stateRevision,
          user,
          tx,
        );
    },
    run: (tx) => updateDeadlineStateInTransaction(user, body, tx),
  });
}
