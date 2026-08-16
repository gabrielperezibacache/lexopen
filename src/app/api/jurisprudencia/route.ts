import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireRole,
  requireStaff,
} from "@/lib/api";
import { parseLocalDateInput } from "@/lib/minutas";
import { writeAuditStrict } from "@/lib/audit";

const listSelect = {
  id: true,
  rol: true,
  tribunal: true,
  sala: true,
  caratula: true,
  descripcion: true,
  doctrina: true,
  materia: true,
  tags: true,
  fuente: true,
  fecha: true,
} satisfies Prisma.JurisprudenciaSelect;

const itemSchema = z.object({
  rol: z.string().trim().min(1).max(120),
  tribunal: z.string().trim().min(1).max(200),
  sala: z.string().trim().max(80).optional().nullable(),
  fecha: z.string().optional().nullable(),
  materia: z.string().trim().max(120).optional().nullable(),
  caratula: z.string().trim().max(500).optional().nullable(),
  descripcion: z.string().trim().max(5000).optional().nullable(),
  doctrina: z.string().trim().max(20000).optional().nullable(),
  texto: z.string().trim().max(200000).optional().nullable(),
  url: z.string().trim().max(2000).optional().nullable(),
  fuente: z.string().trim().max(120).optional().nullable(),
  tags: z.string().trim().max(500).optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";
    const materia = searchParams.get("materia")?.trim() || "";
    const tribunal = searchParams.get("tribunal")?.trim() || "";
    const includeTexto = searchParams.get("full") === "1";

    const where: Prisma.JurisprudenciaWhereInput = {
      AND: [
        materia ? { materia } : {},
        tribunal
          ? { tribunal: { contains: tribunal, mode: "insensitive" } }
          : {},
        q
          ? {
              OR: [
                { rol: { contains: q, mode: "insensitive" } },
                { tribunal: { contains: q, mode: "insensitive" } },
                { caratula: { contains: q, mode: "insensitive" } },
                { descripcion: { contains: q, mode: "insensitive" } },
                { doctrina: { contains: q, mode: "insensitive" } },
                { texto: { contains: q, mode: "insensitive" } },
                { tags: { contains: q, mode: "insensitive" } },
                { materia: { contains: q, mode: "insensitive" } },
              ],
            }
          : {},
      ],
    };

    const filtered = await prisma.jurisprudencia.findMany({
      where,
      orderBy: { fecha: "desc" },
      take: includeTexto ? 50 : 200,
      select: includeTexto ? { ...listSelect, texto: true } : listSelect,
    });

    if (!includeTexto) {
      return NextResponse.json(
        filtered.map((row) => ({
          ...row,
          doctrina:
            row.doctrina && row.doctrina.length > 1200
              ? `${row.doctrina.slice(0, 1200)}…`
              : row.doctrina,
        }))
      );
    }

    return NextResponse.json(filtered);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireRole("admin");
    const body = await req.json();
    const itemsRaw = Array.isArray(body.items) ? body.items : [body];
    const items = z.array(itemSchema).min(1).max(200).parse(itemsRaw);

    const data = items.map((item) => ({
      rol: item.rol,
      tribunal: item.tribunal,
      sala: item.sala || null,
      fecha: item.fecha ? parseLocalDateInput(item.fecha) : null,
      materia: item.materia || null,
      caratula: item.caratula || null,
      descripcion: item.descripcion || null,
      doctrina: item.doctrina || null,
      texto: item.texto || null,
      url: item.url || null,
      fuente: item.fuente || "manual",
      tags: item.tags || "",
    }));

    const created = await prisma.jurisprudencia.createMany({ data });
    await writeAuditStrict({
      actorId: user.id,
      action: "jurisprudencia.import",
      entityType: "Jurisprudencia",
      after: { count: created.count },
    });
    return NextResponse.json({ ok: true, created: created.count }, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
