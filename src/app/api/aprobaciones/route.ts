import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { publicUserSelect } from "@/lib/auth/public-user";
import {
  APROBACION_TIPOS,
  createAprobacion,
  isAprobacionTipo,
} from "@/lib/auth/aprobacion";
import { can } from "@/lib/auth/permissions";
import { parseListLimit } from "@/lib/api/list-limit";

const createSchema = z.object({
  tipo: z.enum(APROBACION_TIPOS),
  titulo: z.string().min(2).max(300),
  detalle: z.string().max(5000).optional().nullable(),
  entityType: z.string().min(1).max(80),
  entityId: z.string().min(1).max(100),
  aprobadorId: z.string().min(1).optional().nullable(),
  venceAt: z.string().datetime().optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const estado = req.nextUrl.searchParams.get("estado") || "pendiente";
    const mine = req.nextUrl.searchParams.get("mine");
    const limit = parseListLimit(req.nextUrl.searchParams.get("limit"), {
      default: 100,
      max: 300,
    });

    const rows = await prisma.aprobacion.findMany({
      where: {
        AND: [
          estado && estado !== "all" ? { estado } : {},
          mine === "solicitadas"
            ? { solicitanteId: user.id }
            : mine === "asignadas" || !mine
              ? {
                  OR: [
                    { aprobadorId: user.id },
                    { aprobadorId: null },
                  ],
                }
              : {},
        ],
      },
      include: {
        solicitante: { select: publicUserSelect },
        aprobador: { select: publicUserSelect },
      },
      orderBy: [{ estado: "asc" }, { createdAt: "desc" }],
      take: limit,
    });

    // Filtra asignadas genéricas: solo si el usuario puede aprobar ese tipo.
    const filtered = rows.filter((row) => {
      if (row.aprobadorId === user.id || row.solicitanteId === user.id) return true;
      if (row.aprobadorId) return false;
      if (can(user, "host.admin")) return true;
      if (row.tipo === "escrito" || row.tipo === "minuta") {
        return can(user, "escrito.approve");
      }
      if (row.tipo === "time_batch") return can(user, "time.approve");
      if (["invoice", "gasto", "descuento"].includes(row.tipo)) {
        return can(user, "billing.manage");
      }
      if (row.tipo === "override_walls") return can(user, "causa.override_walls");
      if (row.tipo === "envio_cliente") return can(user, "client.message");
      return false;
    });

    return NextResponse.json(filtered);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(req, createSchema);
    if (!isAprobacionTipo(body.tipo)) {
      return NextResponse.json({ error: "Tipo inválido" }, { status: 400 });
    }

    if (body.aprobadorId) {
      const apr = await prisma.user.findUnique({
        where: { id: body.aprobadorId },
        select: { id: true },
      });
      if (!apr) {
        return NextResponse.json({ error: "Aprobador no encontrado" }, { status: 400 });
      }
    }

    const row = await createAprobacion({
      tipo: body.tipo,
      titulo: body.titulo,
      detalle: body.detalle,
      entityType: body.entityType,
      entityId: body.entityId,
      solicitanteId: user.id,
      aprobadorId: body.aprobadorId,
      venceAt: body.venceAt ? new Date(body.venceAt) : null,
    });

    if (row.aprobadorId) {
      await prisma.notification.create({
        data: {
          userId: row.aprobadorId,
          title: "Aprobación pendiente",
          body: row.titulo,
          href: "/tareas?tab=aprobaciones",
        },
      });
    }

    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
