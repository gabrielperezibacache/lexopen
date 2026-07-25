import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { writeAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

function parseCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"' && line[i + 1] === '"') {
      current += '"';
      i += 1;
    } else if (ch === '"') {
      quoted = !quoted;
    } else if (ch === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseMovimientosCsv(csv: string) {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (lines.length === 0) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  return lines.slice(1).map((line) => {
    const row = parseCsvLine(line);
    const get = (name: string) => row[headers.indexOf(name)] || "";
    return {
      titulo: get("titulo") || get("title") || row[0] || "",
      detalle: get("detalle") || get("detail") || row[1] || "",
      fecha: get("fecha") || get("date") || row[2] || "",
      fuente: get("fuente") || "import",
    };
  }).filter((row) => row.titulo.trim());
}

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
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    if (req.headers.get("content-type")?.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");
      const csv =
        file instanceof File
          ? Buffer.from(await file.arrayBuffer()).toString("utf8")
          : String(form.get("csv") || "");
      const rows = parseMovimientosCsv(csv);
      if (rows.length === 0) {
        return NextResponse.json({ error: "CSV sin movimientos válidos" }, { status: 400 });
      }
      const created = await prisma.$transaction(async (tx) => {
        const causa = await tx.causa.findUnique({
          where: { id },
          select: { abogadoId: true, rit: true, titulo: true },
        });
        const movimientos = await Promise.all(
          rows.map((row) =>
            tx.causaMovimiento.create({
              data: {
                causaId: id,
                titulo: row.titulo,
                detalle: row.detalle || null,
                fuente: row.fuente || "import",
                fecha: row.fecha ? new Date(row.fecha) : new Date(),
              },
            })
          )
        );
        await tx.activity.create({
          data: {
            tipo: "alerta",
            mensaje: `Movimientos importados: ${movimientos.length}`,
            causaId: id,
            userId: user.id,
          },
        });
        if (causa?.abogadoId) {
          await tx.notification.create({
            data: {
              title: `Movimientos importados · ${causa.rit || causa.titulo}`,
              body: `${movimientos.length} movimientos cargados desde CSV.`,
              href: `/causas/${id}`,
              userId: causa.abogadoId,
            },
          });
        }
        return movimientos;
      });
      await writeAudit({
        actorId: user.id,
        action: "causa.movimientos.import",
        entityType: "Causa",
        entityId: id,
        after: { count: created.length },
      });
      return NextResponse.json({ rows: created.length }, { status: 201 });
    }
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
