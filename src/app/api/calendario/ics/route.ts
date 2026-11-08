import { handleRouteError, requireStaff } from "@/lib/api";
import { relatedCausaWhere as scopedrelatedCausaWhere } from "@/lib/auth/causa-access";
import { parseDateInput } from "@/lib/date-input";
import { httpError } from "@/lib/auth/access";
import { buildIcs } from "@/lib/calendario/ics";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

const DEFAULT_WINDOW_DAYS = 180;

/**
 * `GET /api/calendario/ics` — export ICS (RFC 5545) de eventos/audiencias.
 * Staff-only. `desde`/`hasta` (ISO) opcionales; por defecto una ventana de
 * ±180 días desde hoy. `causaId` opcional acota a una causa.
 */
export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const sp = new URL(req.url).searchParams;
    const causaId = sp.get("causaId");
    for (const field of ["desde", "hasta"]) if (sp.has(field) && !parseDateInput(sp.get(field)!)) throw httpError("Rango de fechas inválido", 400);
    const now = new Date();
    const desde = sp.get("desde") ? new Date(sp.get("desde")!) : new Date(now.getTime() - DEFAULT_WINDOW_DAYS * 86_400_000);
    const hasta = sp.get("hasta") ? new Date(sp.get("hasta")!) : new Date(now.getTime() + DEFAULT_WINDOW_DAYS * 86_400_000);

    if (desde > hasta) throw httpError("El inicio del rango debe preceder al fin", 400);
    const eventos = await prisma.evento.findMany({
      where: { AND: [scopedrelatedCausaWhere(user), {
        estado: { not: "cancelado" },
        inicio: { gte: desde, lte: hasta },
        ...(causaId ? { causaId } : {}),
      }] },
      orderBy: { inicio: "asc" },
      take: 1000,
    });

    const ics = buildIcs(
      eventos.map((e) => ({
        id: e.id,
        titulo: e.titulo,
        inicio: e.inicio,
        fin: e.fin,
        todoElDia: e.todoElDia,
        lugar: e.lugar,
        notas: e.notas,
        updatedAt: e.updatedAt,
      }))
    );

    return new NextResponse(ics, {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="lexopen-calendario.ics"',
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
