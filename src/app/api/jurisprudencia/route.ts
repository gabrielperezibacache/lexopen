import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { handleRouteError, requireStaff } from "@/lib/api";

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
      select: includeTexto
        ? { ...listSelect, texto: true }
        : listSelect,
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
