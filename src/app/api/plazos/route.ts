import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  jsonError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { plazoCreateSchema } from "@/lib/schemas";
import { calcularVencimiento } from "@/lib/plazos";
import { parseLocalDateInput } from "@/lib/minutas";
import { writeAudit } from "@/lib/audit";
import { publicUserSelect } from "@/lib/auth/public-user";
import { z } from "zod";

export async function GET() {
  try {
    await requireStaff();
    const plazos = await prisma.plazo.findMany({
      include: {
        causa: true,
        responsable: { select: publicUserSelect },
      },
      orderBy: { fechaLimite: "asc" },
    });
    return NextResponse.json(plazos);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(req, plazoCreateSchema);

    let fechaLimite = parseLocalDateInput(body.fechaLimite || undefined);
    const fechaNotificacion = parseLocalDateInput(
      body.fechaNotificacion || undefined
    );

    if (!fechaLimite && body.diasPlazo && fechaNotificacion) {
      fechaLimite = calcularVencimiento({
        desde: fechaNotificacion,
        dias: body.diasPlazo,
        tipoComputo: body.tipoComputo || "habiles",
      });
    }
    if (!fechaLimite && body.diasPlazo) {
      fechaLimite = calcularVencimiento({
        desde: new Date(),
        dias: body.diasPlazo,
        tipoComputo: body.tipoComputo || "habiles",
      });
    }
    if (!fechaLimite) {
      return jsonError("Indique fechaLimite o diasPlazo", 400);
    }

    const plazo = await prisma.plazo.create({
      data: {
        titulo: body.titulo,
        descripcion: body.descripcion || null,
        fechaLimite,
        fechaNotificacion,
        diasPlazo: body.diasPlazo || null,
        tipoComputo: body.tipoComputo || "habiles",
        esFatal: Boolean(body.esFatal),
        tipo: body.tipo || "procesal",
        estado: "pendiente",
        causaId: body.causaId || null,
        responsableId: body.responsableId || user.id,
      },
    });

    if (plazo.causaId) {
      await prisma.activity.create({
        data: {
          tipo: "plazo",
          mensaje: `Plazo${plazo.esFatal ? " fatal" : ""}: ${plazo.titulo} (${plazo.fechaLimite.toISOString().slice(0, 10)})`,
          causaId: plazo.causaId,
          userId: user.id,
        },
      });
    }
    await writeAudit({
      actorId: user.id,
      action: "plazo.create",
      entityType: "Plazo",
      entityId: plazo.id,
      after: plazo,
    });

    return NextResponse.json(plazo, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = z
      .object({
        id: z.string(),
        estado: z.enum(["pendiente", "cumplido", "vencido", "suspendido"]),
      })
      .parse(await req.json());
    const plazo = await prisma.plazo.update({
      where: { id: body.id },
      data: { estado: body.estado },
    });
    await writeAudit({
      actorId: user.id,
      action: "plazo.update",
      entityType: "Plazo",
      entityId: plazo.id,
      after: { estado: plazo.estado },
    });
    return NextResponse.json(plazo);
  } catch (e) {
    return handleRouteError(e);
  }
}
