import type { z } from "zod";
import { executeCommand, serializable } from "@/lib/command-execution";
import { currentStaffActor, type StaffActor } from "@/lib/auth/staff-actor";
import { httpError } from "@/lib/auth/access";
import {
  causaAccessWhere,
  ensureResponsableMiembro,
} from "@/lib/auth/causa-access";
import { can, canSome } from "@/lib/auth/permissions";
import { isStaff } from "@/lib/auth/rbac";
import { publicUserSelect } from "@/lib/auth/public-user";
import { checkConflicts } from "@/lib/conflict";
import { writeAuditStrict } from "@/lib/audit";
import { parseLocalDateInput } from "@/lib/minutas";
import { duplicateCausaWhere } from "@/lib/pjud/causa-origin";
import { causaCreateSchema } from "@/lib/schemas";

export class CausaCreateConflict extends Error {
  readonly status = 409;
  constructor(readonly payload: Record<string, unknown> & { error: string }) {
    super(payload.error);
  }
}
function authorize(
  actor: {
    role: string;
    capabilityGrants?: string | null;
    capabilityRevokes?: string | null;
  },
  body: z.infer<typeof causaCreateSchema>,
) {
  if (!canSome(actor, "causa.create"))
    throw httpError("Sin permiso para crear causas", 403);
  if (body.conflictOverride && !can(actor, "causa.override_walls"))
    throw httpError("Sin permiso para autorizar conflictos", 403);
}
export async function createCausaCommand(
  user: StaffActor,
  raw: unknown,
  key: string,
) {
  const body = causaCreateSchema.parse(raw);
  // Older clients omitted the historical default. An explicit default must
  // still replay that receipt, while a team wall remains part of its identity.
  const { acceso, ...legacyInput } = body;
  const input = acceso === "equipo" ? body : legacyInput;
  // Receipts retain only the identity. A replay reads current data and permissions.
  const receipt = await executeCommand<{ id: string }>({
    key,
    ownerId: user.id,
    input,
    authorize: async (tx, result) => {
      const actor = await currentStaffActor(user, tx);
      authorize(actor, body);
      if (
        result &&
        !(await tx.causa.findFirst({
          where: { AND: [{ id: result.id }, causaAccessWhere(actor)] },
          select: { id: true },
        }))
      )
        throw httpError("Causa no encontrada", 404);
    },
    run: async (tx) => {
      const actor = await currentStaffActor(user, tx);
      authorize(actor, body);
      const abogadoId = body.abogadoId || actor.id;
      const responsable = await tx.user.findUnique({
        where: { id: abogadoId },
        select: { role: true, capabilityGrants: true, capabilityRevokes: true },
      });
      if (!responsable || !isStaff(responsable.role) ||
        !can(responsable, "causa.read", { causaRol: "responsable" }) ||
        !can(responsable, "causa.write", { causaRol: "responsable" }))
        throw httpError("El responsable ya no está disponible", 403);
      if (
        body.clienteId &&
        !(await tx.cliente.findUnique({
          where: { id: body.clienteId },
          select: { id: true },
        }))
      )
        throw httpError("Cliente no encontrado", 404);
      const duplicateWhere = duplicateCausaWhere(body);
      const existing =
        duplicateWhere &&
        (await tx.causa.findFirst({
          where: duplicateWhere,
          select: { id: true, titulo: true, rit: true },
        }));
      if (existing) {
        const visible = await tx.causa.findFirst({
          where: { AND: [{ id: existing.id }, causaAccessWhere(actor)] },
          select: { id: true },
        });
        throw new CausaCreateConflict(
          visible
            ? {
                error:
                  "Ya existe una causa con esa referencia en el mismo tribunal u órgano",
                code: "causa_duplicate",
                existingId: existing.id,
                ...existing,
              }
            : {
                error:
                  "Existe una coincidencia reservada. Requiere revisión autorizada.",
                code: "causa_duplicate",
              },
        );
      }
      const currentRisk = await checkConflicts({
        user: actor,
        partes: (body.partes || []).map((p) => ({
          nombre: p.nombre,
          rut: p.rut,
        })),
        client: tx,
      });
      if (currentRisk.status === "blocked" && !body.conflictOverride)
        throw new CausaCreateConflict({
          error: "Posible conflicto de interés detectado",
          ...currentRisk,
        });
      if (
        currentRisk.status === "blocked" &&
        body.conflictOverride &&
        !body.conflictNotes?.trim()
      )
        throw httpError("Debe registrar el fundamento de la autorización", 400);
      const causa = await tx.causa.create({
        data: {
          titulo: body.titulo,
          rit: body.rit || null,
          ruc: body.ruc || null,
          tribunal: body.tribunal,
          materia: body.materia,
          procedimiento: body.procedimiento || null,
          estado: body.estado || "activa",
          acceso: body.acceso ?? "estudio",
          etapa: body.etapa || "ingreso",
          caratula: body.caratula || null,
          resumen: body.resumen || null,
          sala: body.sala || null,
          cuaderno: body.cuaderno || null,
          abogadoContraparte: body.abogadoContraparte || null,
          fechaNotificacion: parseLocalDateInput(
            body.fechaNotificacion || undefined,
          ),
          fechaIngreso: new Date(),
          pjudOrigin: "manual",
          clienteId: body.clienteId || null,
          abogadoId,
          miembros: body.acceso === "equipo" && abogadoId !== actor.id
            ? { create: { userId: actor.id, rol: "colaborador", agregadoPorId: actor.id } }
            : undefined,
          conflictCheckedAt: new Date(),
          conflictStatus: currentRisk.status,
          conflictNotes: body.conflictNotes || null,
          partes: body.partes?.length
            ? {
                create: body.partes.map((p) => ({
                  nombre: p.nombre,
                  rut: p.rut || null,
                  rol: p.rol,
                  domicilio: p.domicilio || null,
                })),
              }
            : undefined,
          etapaHistorial: {
            create: { etapa: body.etapa || "ingreso", nota: "Alta de causa" },
          },
        },
        include: {
          partes: true,
          cliente: true,
          abogado: { select: publicUserSelect },
        },
      });

      await tx.activity.create({
        data: {
          tipo: "estado",
          mensaje: `Nueva causa creada: ${causa.titulo}`,
          causaId: causa.id,
          userId: actor.id,
        },
      });
      await ensureResponsableMiembro(causa.id, abogadoId, actor.id, tx);
      if (
        !(await tx.causa.findFirst({
          where: { AND: [{ id: causa.id }, causaAccessWhere(actor)] },
          select: { id: true },
        }))
      )
        throw httpError("No tiene acceso al expediente que intenta crear", 403);

      await writeAuditStrict(
        {
          actorId: actor.id,
          action:
            body.conflictOverride && currentRisk.status === "blocked"
              ? "causa.create.conflict_override"
              : "causa.create",
          entityType: "Causa",
          entityId: causa.id,
          after: {
            titulo: causa.titulo,
            acceso: causa.acceso,
            abogadoId,
            rit: causa.rit,
            conflicts: currentRisk.conflicts,
            conflictOverride: Boolean(
              body.conflictOverride && currentRisk.status === "blocked",
            ),
            conflictNotes: body.conflictNotes || null,
          },
        },
        tx,
      );

      return { id: causa.id };
    },
  });
  return serializable(async (tx) => {
    const actor = await currentStaffActor(user, tx);
    authorize(actor, body);
    const causa = await tx.causa.findFirst({
      where: { AND: [{ id: receipt.id }, causaAccessWhere(actor)] },
      include: {
        partes: true,
        cliente: true,
        abogado: { select: publicUserSelect },
      },
    });
    if (!causa) throw httpError("Causa no encontrada", 404);
    const risk = await checkConflicts({
      user: actor,
      partes: causa.partes,
      excludeCausaId: causa.id,
      client: tx,
    });
    return { ...causa, ...risk };
  });
}
