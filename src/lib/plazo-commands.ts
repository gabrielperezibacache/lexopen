import { z } from "zod";
import { plazoCreateSchema } from "@/lib/schemas";
import { httpError } from "@/lib/auth/access";
import { can } from "@/lib/auth/permissions";
import { STAFF_ROLES } from "@/lib/auth/roles";
import { assertCausaAccess, assertCausaCapability, plazoAccessWhere, type CausaAccessUser } from "@/lib/auth/causa-access";
import { executeCommand } from "@/lib/command-execution";
import { writeAuditStrict } from "@/lib/audit";
import { civilDateKey } from "@/lib/chile-time";
import { calcularVencimiento } from "@/lib/plazos";
import { parseLocalDateInput } from "@/lib/minutas";

export const plazoStateSchema = z.object({
  id: z.string().min(1),
  estado: z.enum(["pendiente", "cumplido", "vencido", "suspendido"]),
});

export async function createPlazoCommand(user: CausaAccessUser, body: z.infer<typeof plazoCreateSchema>, commandKey: string) {
  const fechaNotificacion = parseLocalDateInput(body.fechaNotificacion || undefined);
  const fechaLimite = parseLocalDateInput(body.fechaLimite || undefined) || (body.diasPlazo ? calcularVencimiento({
    desde: fechaNotificacion || new Date(), dias: body.diasPlazo, tipoComputo: body.tipoComputo || "habiles",
  }) : null);
  if (!fechaLimite) throw httpError("Indique fechaLimite o diasPlazo", 400);
  return executeCommand({
    key: commandKey, ownerId: user.id, input: body,
    authorize: async (tx) => {
      if (body.causaId) await assertCausaCapability(body.causaId, user, "plazo.edit", tx);
      else if (!can(user, "plazo.edit", { own: !body.responsableId || body.responsableId === user.id })) throw httpError("Sin permiso para crear este plazo", 403);
      if (body.responsableId) {
        const target = await tx.user.findFirst({ where: { id: body.responsableId, role: { in: [...STAFF_ROLES] } } });
        if (!target) throw httpError("Responsable no válido", 400);
        if (body.causaId) await assertCausaAccess(body.causaId, target, undefined, tx);
      }
    },
    run: async (tx) => {
      const plazo = await tx.plazo.create({ data: {
        titulo: body.titulo, descripcion: body.descripcion || null, fechaLimite, fechaNotificacion,
        diasPlazo: body.diasPlazo || null, tipoComputo: body.tipoComputo || "habiles", esFatal: Boolean(body.esFatal),
        tipo: body.tipo || "procesal", estado: "pendiente", causaId: body.causaId || null, responsableId: body.responsableId || user.id,
      } });
      if (plazo.causaId) await tx.activity.create({ data: {
        tipo: "plazo", mensaje: `Plazo${plazo.esFatal ? " fatal" : ""}: ${plazo.titulo} (${civilDateKey(plazo.fechaLimite)})`, causaId: plazo.causaId, userId: user.id,
      } });
      await writeAuditStrict({ actorId: user.id, action: "plazo.create", entityType: "Plazo", entityId: plazo.id, after: plazo }, tx);
      return plazo;
    },
  });
}

export async function updatePlazoCommand(user: CausaAccessUser, body: z.infer<typeof plazoStateSchema>, commandKey: string) {
  return executeCommand({
    key: commandKey, ownerId: user.id, input: body,
    authorize: async (tx) => {
      const current = await tx.plazo.findFirst({ where: { id: body.id, ...plazoAccessWhere(user) } });
      if (!current) throw httpError("Plazo no encontrado", 404);
      const capability = body.estado === "cumplido" ? "plazo.close" : "plazo.edit";
      if (current.causaId) await assertCausaCapability(current.causaId, user, capability, tx);
      else if (!can(user, capability, { own: current.responsableId === user.id })) throw httpError("Sin permiso para modificar este plazo", 403);
    },
    run: async (tx) => {
      const before = await tx.plazo.findUniqueOrThrow({ where: { id: body.id } });
      const updated = await tx.plazo.update({ where: { id: body.id }, data: { estado: body.estado } });
      await writeAuditStrict({ actorId: user.id, action: "plazo.update", entityType: "Plazo", entityId: updated.id,
        before: { estado: before.estado }, after: { estado: updated.estado },
      }, tx);
      return updated;
    },
  });
}
