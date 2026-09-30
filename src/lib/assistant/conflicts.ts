/**
 * Conflictos de agenda (doble reserva) para `Evento`, usados en el paso de
 * confirmación humana del asistente y por las rutas `/api/eventos`.
 */

import { prisma } from "@/lib/db";

export type EventConflict = {
  id: string;
  titulo: string;
  inicio: Date;
  fin: Date | null;
};

/**
 * Eventos del mismo responsable que se solapan con `[inicio, fin]`.
 * `fin` ausente se trata como instantáneo (`inicio` = `fin`).
 */
export async function detectEventConflicts(
  inicio: Date,
  fin: Date | null | undefined,
  responsableId: string,
  excludeId?: string
): Promise<EventConflict[]> {
  const finEfectivo = fin ?? inicio;
  const eventos = await prisma.evento.findMany({
    where: {
      responsableId,
      estado: { not: "cancelado" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
      inicio: { lte: finEfectivo },
    },
    select: { id: true, titulo: true, inicio: true, fin: true },
    orderBy: { inicio: "asc" },
    take: 200,
  });

  return eventos.filter((evento) => {
    const otroFin = evento.fin ?? evento.inicio;
    return evento.inicio <= finEfectivo && otroFin >= inicio;
  });
}

export function describeEventConflicts(conflicts: EventConflict[]): string {
  if (conflicts.length === 0) return "";
  const detalle = conflicts
    .map((c) => `"${c.titulo}" (${c.inicio.toISOString().slice(0, 16)})`)
    .join(", ");
  return `⚠ Conflicto de agenda: se solapa con ${conflicts.length} evento(s) del mismo responsable: ${detalle}.`;
}
