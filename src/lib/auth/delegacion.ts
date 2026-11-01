/**
 * Delegaciones activas: el delegado ejerce capacidades del delegador
 * sobre recursos de este (agenda, tareas, copia de notificaciones).
 */

import {
  canSome,
  isCapability,
  parseCapabilityCsv,
  type Capability,
} from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

const DELEGABLE = new Set<Capability>([
  "evento.manage",
  "task.assign",
  "notify.channels.self",
]);

export function parseDelegacionAlcance(csv: string): Capability[] {
  return parseCapabilityCsv(csv).filter((c) => DELEGABLE.has(c));
}

export function isDelegableCapability(cap: string): cap is Capability {
  return isCapability(cap) && DELEGABLE.has(cap);
}

/** IDs de usuarios cuyas capacidades el `delegadoId` puede ejercer ahora. */
export async function activeDelegadorIds(
  delegadoId: string,
  cap?: Capability,
  client: Prisma.TransactionClient = prisma
): Promise<string[]> {
  const now = new Date();
  const rows = await client.delegacion.findMany({
    where: {
      delegadoId,
      activa: true,
      desde: { lte: now },
      OR: [{ hasta: null }, { hasta: { gt: now } }],
    },
    select: { delegadorId: true, alcance: true, delegador: { select: { role: true, capabilityGrants: true, capabilityRevokes: true } } },
  });
  const out: string[] = [];
  for (const row of rows) {
    if (!cap || (parseDelegacionAlcance(row.alcance).includes(cap) && canSome(row.delegador, cap))) {
      out.push(row.delegadorId);
    }
  }
  return out;
}

export async function canActViaDelegacion(opts: {
  actorId: string;
  onBehalfOfId: string;
  cap: Capability;
}, client: Prisma.TransactionClient = prisma) {
  if (opts.actorId === opts.onBehalfOfId) return false;
  if (!isDelegableCapability(opts.cap)) return false;
  const ids = await activeDelegadorIds(opts.actorId, opts.cap, client);
  return ids.includes(opts.onBehalfOfId);
}
