import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { verifyCronSecret } from "@/lib/security/cron-secret";
import { startOfDay } from "@/lib/plazos";

function authorizedByCron(req: NextRequest) {
  const header =
    req.headers.get("x-cron-secret") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return verifyCronSecret(header);
}

/** Genera notificaciones para plazos próximos (staff o cron con CRON_SECRET). */
export async function POST(req: NextRequest) {
  try {
    if (!authorizedByCron(req)) {
      assertCsrf(req);
      await requireStaff();
    }

    const daysParam = Number(req.nextUrl.searchParams.get("days") || "3");
    const days = Number.isFinite(daysParam)
      ? Math.max(0, Math.min(30, Math.trunc(daysParam)))
      : 3;
    const from = startOfDay(new Date());
    const until = startOfDay(new Date(from.getTime() + days * 24 * 60 * 60 * 1000));

    const plazos = await prisma.plazo.findMany({
      where: {
        estado: "pendiente",
        alertaEnviada: false,
        fechaLimite: { gte: from, lte: until },
      },
      include: {
        responsable: { select: { id: true } },
        causa: { select: { id: true, titulo: true, rit: true, abogadoId: true } },
      },
      orderBy: { fechaLimite: "asc" },
      take: 100,
    });

    let notifications = 0;
    for (const plazo of plazos) {
      const userIds = new Set<string>();
      if (plazo.responsable?.id) userIds.add(plazo.responsable.id);
      if (plazo.causa?.abogadoId) userIds.add(plazo.causa.abogadoId);
      if (userIds.size === 0) continue;

      await prisma.notification.createMany({
        data: [...userIds].map((userId) => ({
          userId,
          title: `Plazo próximo · ${plazo.causa?.rit || plazo.causa?.titulo || "sin causa"}`,
          body: `${plazo.titulo} vence el ${plazo.fechaLimite.toISOString().slice(0, 10)}.`,
          href: plazo.causaId ? `/causas/${plazo.causaId}` : "/plazos",
        })),
      });
      notifications += userIds.size;
      await prisma.plazo.update({
        where: { id: plazo.id },
        data: { alertaEnviada: true },
      });
    }

    return NextResponse.json({
      ok: true,
      days,
      plazos: plazos.length,
      notifications,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
