import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { handleRouteError, requireStaff } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim() || "";
    const materia = searchParams.get("materia")?.trim() || "";
    const tribunal = searchParams.get("tribunal")?.trim() || "";

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
      take: 200,
    });

    return NextResponse.json(filtered);
  } catch (e) {
    return handleRouteError(e);
  }
}
