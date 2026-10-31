/**
 * Aprobaciones genéricas ligadas a cualquier entidad (escrito, horas, factura…).
 */

import { prisma } from "@/lib/db";
import { httpError } from "@/lib/auth/access";
import { can, type PermissionSubject } from "@/lib/auth/permissions";
import { writeAuditStrict } from "@/lib/audit";

export const APROBACION_TIPOS = [
  "escrito",
  "time_batch",
  "invoice",
  "gasto",
  "descuento",
  "override_walls",
  "envio_cliente",
  "minuta",
] as const;

export type AprobacionTipo = (typeof APROBACION_TIPOS)[number];

export const APROBACION_ESTADOS = [
  "pendiente",
  "aprobada",
  "rechazada",
  "expirada",
  "cancelada",
] as const;

export function isAprobacionTipo(v: string): v is AprobacionTipo {
  return (APROBACION_TIPOS as readonly string[]).includes(v);
}

/** Capacidad que habilita a resolver según tipo. */
export function capabilityForAprobacionTipo(tipo: string) {
  switch (tipo) {
    case "escrito":
    case "minuta":
      return "escrito.approve" as const;
    case "time_batch":
      return "time.approve" as const;
    case "invoice":
    case "gasto":
    case "descuento":
      return "billing.manage" as const;
    case "override_walls":
      return "causa.override_walls" as const;
    case "envio_cliente":
      return "client.message" as const;
    default:
      return null;
  }
}

export async function createAprobacion(opts: {
  tipo: AprobacionTipo;
  titulo: string;
  detalle?: string | null;
  entityType: string;
  entityId: string;
  solicitanteId: string;
  aprobadorId?: string | null;
  venceAt?: Date | null;
}) {
  return prisma.aprobacion.create({
    data: {
      tipo: opts.tipo,
      titulo: opts.titulo,
      detalle: opts.detalle ?? null,
      entityType: opts.entityType,
      entityId: opts.entityId,
      solicitanteId: opts.solicitanteId,
      aprobadorId: opts.aprobadorId ?? null,
      venceAt: opts.venceAt ?? null,
      estado: "pendiente",
    },
  });
}

export async function resolveAprobacion(opts: {
  id: string;
  actor: PermissionSubject & { id: string };
  decision: "aprobada" | "rechazada" | "cancelada";
  comentario?: string | null;
}) {
  const row = await prisma.aprobacion.findUnique({ where: { id: opts.id } });
  if (!row) throw httpError("Aprobación no encontrada", 404);
  if (row.estado !== "pendiente") {
    throw httpError("La aprobación ya fue resuelta", 409);
  }

  if (opts.decision === "cancelada") {
    if (row.solicitanteId !== opts.actor.id && !can(opts.actor, "host.admin")) {
      throw httpError("Solo el solicitante puede cancelar", 403);
    }
  } else {
    const cap = capabilityForAprobacionTipo(row.tipo);
    const assigned =
      !row.aprobadorId || row.aprobadorId === opts.actor.id || can(opts.actor, "host.admin");
    if (!cap || !can(opts.actor, cap) || !assigned) {
      throw httpError("No puede resolver esta aprobación", 403);
    }
  }

  const updated = await prisma.aprobacion.update({
    where: { id: row.id },
    data: {
      estado: opts.decision,
      comentario: opts.comentario ?? null,
      resueltaAt: new Date(),
      resueltaPorId: opts.actor.id,
    },
  });

  await writeAuditStrict({
    actorId: opts.actor.id,
    action: `aprobacion.${opts.decision}`,
    entityType: "Aprobacion",
    entityId: row.id,
    after: {
      tipo: row.tipo,
      entityType: row.entityType,
      entityId: row.entityId,
      decision: opts.decision,
    },
  });

  return updated;
}
