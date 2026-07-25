import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    await requireStaff();
    const { id } = await params;
    const rows = await prisma.causaMovimiento.findMany({
      where: { causaId: id },
      orderBy: { fecha: "desc" },
    });
    return NextResponse.json(rows);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    const body = await parseBody(
      req,
      z.object({
        titulo: z.string().min(2),
        detalle: z.string().optional().nullable(),
        fuente: z.string().optional(),
        fecha: z.string().optional(),
      })
    );
    const { row, abogadoId } = await prisma.$transaction(async (tx) => {
      const causa = await tx.causa.findUnique({
        where: { id },
        select: { abogadoId: true, rit: true, titulo: true },
      });
      const created = await tx.causaMovimiento.create({
        data: {
          causaId: id,
          titulo: body.titulo,
          detalle: body.detalle || null,
          fuente: body.fuente || "manual",
          fecha: body.fecha ? new Date(body.fecha) : new Date(),
        },
      });
      await tx.activity.create({
        data: {
          tipo: "alerta",
          mensaje: `Movimiento: ${created.titulo}`,
          causaId: id,
          userId: user.id,
        },
      });
      if (causa?.abogadoId) {
        await tx.notification.create({
          data: {
            title: `Nuevo movimiento · ${causa.rit || causa.titulo}`,
            body: created.titulo,
            href: `/causas/${id}`,
            userId: causa.abogadoId,
          },
        });
      }
      return { row: created, abogadoId: causa?.abogadoId || null };
    });
    await writeAudit({
      actorId: user.id,
      action: "causa.movimiento",
      entityType: "CausaMovimiento",
      entityId: row.id,
      after: { ...row, notifiedUserId: abogadoId },
    });
    return NextResponse.json(row, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
