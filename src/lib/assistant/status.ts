/**
 * Estado de Inicio computado en servidor (sin LLM): plazos fatales próximos
 * 7 días, eventos/audiencias de hoy y movimientos PJUD recientes.
 */

import { prisma } from "@/lib/db";
import { civilDayQueryRange, civilSpanQueryRange, santiagoDateKey, addCivilDays } from "@/lib/chile-time";
import { causaAccessWhere, relatedCausaWhere, plazoAccessWhere, type CausaAccessUser } from "@/lib/auth/causa-access";

export type InicioStatus = {
  plazosFatalesProximos: number;
  plazosProximos7d: number;
  eventosHoy: number;
  movimientosRecientes: number;
};

/** Conteos de estado para un usuario staff (agnóstico de rol para lectura propia). */
export async function buildInicioStatus(user: CausaAccessUser, now: Date = new Date()): Promise<InicioStatus> {
  const todayYmd = santiagoDateKey(now);
  const in7dYmd = addCivilDays(todayYmd, 7);
  const proximaSemana = civilSpanQueryRange(todayYmd, in7dYmd);
  const hoy = civilDayQueryRange(todayYmd);
  const desde48h = new Date(now.getTime() - 48 * 60 * 60 * 1000);

  const [plazosFatalesProximos, plazosProximos7d, eventosHoy, movimientosRecientes] =
    await Promise.all([
      prisma.plazo.count({
        where: {
          estado: "pendiente",
          ...plazoAccessWhere(user),
          esFatal: true,
          fechaLimite: { gte: proximaSemana.start, lte: proximaSemana.end },
          responsableId: user.id,
        },
      }),
      prisma.plazo.count({
        where: {
          estado: "pendiente",
          ...plazoAccessWhere(user),
          fechaLimite: { gte: proximaSemana.start, lte: proximaSemana.end },
          responsableId: user.id,
        },
      }),
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
    plazosFatalesProximos,
    plazosProximos7d,
    eventosHoy,
    movimientosRecientes,
  };
}
