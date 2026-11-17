import { personalDeadlineWhere } from "@/lib/deadlines/views";
/**
 * Estado de Inicio computado en servidor (sin LLM): plazos fatales próximos
 * 7 días, eventos/audiencias de hoy y movimientos PJUD recientes.
 */

import { prisma } from "@/lib/db";
import { civilDayQueryRange, santiagoDateKey } from "@/lib/chile-time";
import {
  causaAccessWhere,
  relatedCausaWhere,
  type CausaAccessUser,
} from "@/lib/auth/causa-access";

export type InicioStatus = {
  plazosVencidos: number;
  plazosFatalesProximos: number;
  plazosProximos7d: number;
  eventosHoy: number;
  movimientosRecientes: number;
};

/** Conteos de estado para un usuario staff (agnóstico de rol para lectura propia). */
export async function buildInicioStatus(
  user: CausaAccessUser,
  now: Date = new Date(),
): Promise<InicioStatus> {
  const todayYmd = santiagoDateKey(now);
  const hoy = civilDayQueryRange(todayYmd);
  const desde48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const [
    plazosVencidos,
    plazosFatalesProximos,
    plazosProximos7d,
    eventosHoy,
    movimientosRecientes,
  ] = await Promise.all([
    prisma.plazo.count({
      where: personalDeadlineWhere(user, "mis-vencidos", now),
    }),
    prisma.plazo.count({
      where: {
        AND: [personalDeadlineWhere(user, "proximos", now), { esFatal: true }],
      },
    }),
    prisma.plazo.count({ where: personalDeadlineWhere(user, "proximos", now) }),
    prisma.evento.count({
      where: {
        estado: { not: "cancelado" },
        ...relatedCausaWhere(user),
        inicio: { gte: hoy.start, lte: hoy.end },
        responsableId: user.id,
      },
    }),
    prisma.causaMovimiento.count({
      where: {
        fuente: "pjud",
        createdAt: { gte: desde48h },
        causa: { AND: [causaAccessWhere(user), { abogadoId: user.id }] },
      },
    }),
  ]);

  return {
    plazosVencidos,
    plazosFatalesProximos,
    plazosProximos7d,
    eventosHoy,
    movimientosRecientes,
  };
}
