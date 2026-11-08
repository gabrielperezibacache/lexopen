import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { relatedCausaWhere as scopedrelatedCausaWhere } from "@/lib/auth/causa-access";
import { publicUserSelect } from "@/lib/auth/public-user";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";
import { createEventCommand } from "@/lib/calendario/commands";
import { eventoCreateSchema } from "@/lib/calendario/event-input";
import { requestCommandKey } from "@/lib/command-execution";
import { parseDateInput } from "@/lib/date-input";
import { httpError } from "@/lib/auth/access";

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const sp = new URL(req.url).searchParams;
    const desde = sp.get("desde");
    const hasta = sp.get("hasta");
    const causaId = sp.get("causaId");
    if (desde && !parseDateInput(desde) || hasta && !parseDateInput(hasta)) throw httpError("Rango de fechas inválido", 400);
    if (desde && hasta && new Date(desde) > new Date(hasta)) throw httpError("El inicio del rango debe preceder al fin", 400);

    const eventos = await prisma.evento.findMany({
      where: { AND: [scopedrelatedCausaWhere(user), {
        ...(causaId ? { causaId } : {}),
        ...(desde || hasta ? { inicio: { ...(desde ? { gte: new Date(desde) } : {}), ...(hasta ? { lte: new Date(hasta) } : {}) } } : {}),
      }] },
      include: {
        causa: { select: { id: true, titulo: true, rit: true } },
        cliente: { select: { id: true, razonSocial: true } },
        responsable: { select: publicUserSelect },
      },
      orderBy: { inicio: "asc" },
      take: 500,
    });
    return NextResponse.json(eventos, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(req, eventoCreateSchema);
    const event = await createEventCommand(user, body, requestCommandKey(req, "evento.create"));
    return NextResponse.json(event, { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleRouteError(error); }
}
