import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, parseBody, requireRole, requireStaff } from "@/lib/api";

const tribunalCreateSchema = z.object({
  nombre: z.string().min(3),
  region: z.string().optional().nullable(),
  competencia: z.string().optional().nullable(),
});

export async function GET(req: NextRequest) {
  try {
    await requireStaff();
    const q = req.nextUrl.searchParams.get("q")?.trim();
    const tribunales = await prisma.tribunal.findMany({
      where: {
        activo: true,
        ...(q
          ? {
              OR: [
                { nombre: { contains: q, mode: "insensitive" } },
                { region: { contains: q, mode: "insensitive" } },
                { competencia: { contains: q, mode: "insensitive" } },
              ],
            }
          : {}),
      },
      orderBy: [{ region: "asc" }, { nombre: "asc" }],
    });
    return NextResponse.json({ tribunales });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    await requireRole("admin");
    const body = await parseBody(req, tribunalCreateSchema);
    const tribunal = await prisma.tribunal.upsert({
      where: { nombre: body.nombre },
      create: {
        nombre: body.nombre,
        region: body.region || null,
        competencia: body.competencia || null,
      },
      update: {
        region: body.region || null,
        competencia: body.competencia || null,
        activo: true,
      },
    });
    return NextResponse.json(tribunal, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
