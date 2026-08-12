import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  httpError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { writeAudit } from "@/lib/audit";
import { classifyMovimiento } from "@/lib/pjud/classify";
import { fingerprint } from "@/lib/pjud/provider";
import {
  MOVIMIENTOS_CSV_HEADER,
  parseMovimientosCsv,
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  serializeMovimientosCsv,
} from "@/lib/pjud/import-csv";
import { parseLocalDateInput } from "@/lib/minutas";

type Params = { params: Promise<{ id: string }> };

function parseMovementDate(value?: string) {
  const parsed = parseLocalDateInput(value);
  if (value && !parsed) throw httpError(`Fecha inválida: ${value}`, 400);
  return parsed || new Date();
}

export async function GET(req: NextRequest, { params }: Params) {
  try {
    await requireStaff();
    const { id } = await params;
    if (
      req.nextUrl.searchParams.get("format") === "csv" &&
      req.nextUrl.searchParams.get("template") === "1"
    ) {
      return new NextResponse(`${MOVIMIENTOS_CSV_HEADER}\r\n`, {
        headers: {
          "Content-Type": "text/csv; charset=utf-8",
          "Content-Disposition":
            'attachment; filename="plantilla-movimientos-pjud.csv"',
        },
      });
    }
    if (req.nextUrl.searchParams.get("format") === "csv") {
      const causa = await prisma.causa.findUnique({
        where: { id },
        select: { id: true },
      });
      if (!causa) return NextResponse.json({ error: "Causa no encontrada" }, { status: 404 });
      const rows = await prisma.causaMovimiento.findMany({
        where: { causaId: id },
        orderBy: { fecha: "desc" },
        take: MAX_CSV_ROWS,
        select: {
          titulo: true,
          detalle: true,
          fecha: true,
          referencia: true,
          externalId: true,
        },
      });
      return new NextResponse(
        serializeMovimientosCsv(
          rows.map((row) => ({
            ...row,
            fecha: row.fecha.toISOString().slice(0, 10),
          }))
        ),
        {
          headers: {
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition":
              'attachment; filename="movimientos-pjud.csv"',
          },
        }
      );
    }
    const rawLimit = Number(req.nextUrl.searchParams.get("limit") || 200);
    const rawOffset = Number(req.nextUrl.searchParams.get("offset") || 0);
    const limit = Number.isFinite(rawLimit)
      ? Math.min(Math.max(Math.trunc(rawLimit), 1), 200)
      : 200;
    const offset = Number.isFinite(rawOffset)
      ? Math.max(Math.trunc(rawOffset), 0)
      : 0;
    const rows = await prisma.causaMovimiento.findMany({
      where: { causaId: id },
      orderBy: { fecha: "desc" },
      skip: offset,
      take: limit,
    });
    return NextResponse.json(rows);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      if (file instanceof File && file.size > MAX_CSV_BYTES) {
        return NextResponse.json({ error: "El CSV supera el límite de 5 MB" }, { status: 413 });
      }
      const csv =
        file instanceof File
          ? Buffer.from(await file.arrayBuffer()).toString("utf8")
          : String(form.get("csv") || "");
      const rows = parseMovimientosCsv(csv);
      if (rows.length === 0) {
        return NextResponse.json(
          { error: "CSV sin movimientos válidos" },
          { status: 400 }
        );
      }
      const created = await prisma.$transaction(async (tx) => {
        const causa = await tx.causa.findUnique({
          where: { id },
          select: {
            abogadoId: true,
            abogado: { select: { role: true } },
            rit: true,
            titulo: true,
          },
        });
        if (!causa) throw httpError("Causa no encontrada", 404);
        const movimientos = rows.map((row) => {
          if (!row.fecha.trim()) {
            throw httpError("Cada fila CSV debe incluir una fecha", 400);
          }
          const fecha = parseMovementDate(row.fecha);
          const classified = classifyMovimiento(row.titulo, row.detalle);
          return {
            causaId: id,
            titulo: row.titulo,
            detalle: row.detalle || null,
            fuente: "import",
            tipo: classified.tipo,
            relevante: classified.relevante,
            referencia: row.referencia || null,
            externalId: `import:${row.externalId || fingerprint(row.titulo, fecha, row.referencia)}`,
            fecha,
          };
        });
        const createdRows = await tx.causaMovimiento.createMany({
          data: movimientos,
          skipDuplicates: true,
        });
        const skipped = rows.length - createdRows.count;
        await tx.activity.create({
          data: {
            tipo: "alerta",
            mensaje: `Movimientos importados: ${createdRows.count} nuevos, ${skipped} repetidos`,
            causaId: id,
            userId: user.id,
          },
        });
        if (causa.abogadoId && causa.abogado?.role !== "cliente") {
          await tx.notification.create({
            data: {
              title: `Movimientos importados · ${causa.rit || causa.titulo}`,
              body: `${createdRows.count} movimientos nuevos cargados desde CSV.`,
              href: `/causas/${id}`,
              userId: causa.abogadoId,
            },
          });
        }
        return { created: createdRows.count, skipped };
      });
      await writeAudit({
        actorId: user.id,
        action: "causa.movimientos.import",
        entityType: "Causa",
        entityId: id,
        after: created,
      });
      return NextResponse.json(
        { rows: created.created, skipped: created.skipped },
        { status: 201 }
      );
    }
    const body = await parseBody(
      req,
      z.object({
        titulo: z.string().trim().min(2).max(2000),
        detalle: z.string().max(20_000).optional().nullable(),
        fecha: z.string().max(100).optional(),
      })
    );
    const { row, abogadoId } = await prisma.$transaction(async (tx) => {
      const causa = await tx.causa.findUnique({
        where: { id },
        select: {
          abogadoId: true,
          abogado: { select: { role: true } },
          rit: true,
          titulo: true,
        },
      });
      if (!causa) throw httpError("Causa no encontrada", 404);
      const classified = classifyMovimiento(body.titulo, body.detalle);
      const created = await tx.causaMovimiento.create({
        data: {
          causaId: id,
          titulo: body.titulo,
          detalle: body.detalle || null,
          fuente: "manual",
          tipo: classified.tipo,
          relevante: classified.relevante,
          fecha: parseMovementDate(body.fecha),
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
      if (causa.abogadoId && causa.abogado?.role !== "cliente") {
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
