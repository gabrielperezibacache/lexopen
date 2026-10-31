/**
 * Delegaciones activas: el delegado ejerce capacidades del delegador
 * sobre recursos de este (agenda, tareas, copia de notificaciones).
 */

import { prisma } from "@/lib/db";
import {
  isCapability,
  type Capability,
  parseCapabilityCsv,
} from "@/lib/auth/permissions";

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
  cap?: Capability
): Promise<string[]> {
  const now = new Date();
  const rows = await prisma.delegacion.findMany({
    where: {
      delegadoId,
      activa: true,
      desde: { lte: now },
      OR: [{ hasta: null }, { hasta: { gt: now } }],
    },
    select: { delegadorId: true, alcance: true },
  });
  const out: string[] = [];
  for (const row of rows) {
    if (!cap || parseDelegacionAlcance(row.alcance).includes(cap)) {
      out.push(row.delegadorId);
    }
  }
  return out;
}

export async function canActViaDelegacion(opts: {
  actorId: string;
  onBehalfOfId: string;
  cap: Capability;
}) {
  if (opts.actorId === opts.onBehalfOfId) return true;
  if (!isDelegableCapability(opts.cap)) return false;
  const ids = await activeDelegadorIds(opts.actorId, opts.cap);
  return ids.includes(opts.onBehalfOfId);
}
