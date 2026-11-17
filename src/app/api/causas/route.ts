import { createCausaCommand, CausaCreateConflict } from "@/lib/causas/create-command";
import { requestCommandKey } from "@/lib/command-execution";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { parseListLimit } from "@/lib/api/list-limit";
import { causaAccessWhere as scopedcausaAccessWhere, documentReadWhere as scopeddocumentReadWhere, plazoAccessWhere } from "@/lib/auth/causa-access";
import { publicUserSelect } from "@/lib/auth/public-user";
import { prisma } from "@/lib/db";
import { causaCreateSchema } from "@/lib/schemas";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim();
    const materia = searchParams.get("materia");
    const estado = searchParams.get("estado");
    const limit = parseListLimit(searchParams.get("limit"), {
      default: 200,
      max: 500,
    });

    const causas = await prisma.causa.findMany({
      where: { AND: [scopedcausaAccessWhere(user), {
        AND: [
          scopedcausaAccessWhere(user),
          q
            ? {
                OR: [
                  { titulo: { contains: q, mode: "insensitive" } },
                  { rit: { contains: q, mode: "insensitive" } },
                  { ruc: { contains: q, mode: "insensitive" } },
                  { caratula: { contains: q, mode: "insensitive" } },
                  { tribunal: { contains: q, mode: "insensitive" } },
                ],
              }
            : {},
          materia ? { materia } : {},
          estado ? { estado } : {},
        ],
      }] },
      include: {
        cliente: true,
        abogado: { select: publicUserSelect },
        site: { select: { id: true } },
        plazos: {
          where: { AND: [plazoAccessWhere(user), { estado: "pendiente" }] },
          orderBy: { fechaLimite: "asc" },
          take: 2,
        },
        _count: { select: { documentos: { where: scopeddocumentReadWhere(user) }, partes: true } },
      },
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    return NextResponse.json(causas);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(req, causaCreateSchema);
    const causa = await createCausaCommand(user, body, requestCommandKey(req, "causa.create"));
    return NextResponse.json(causa, { status: 201 });
  } catch (e) {
    if (e instanceof CausaCreateConflict) return NextResponse.json(e.payload, { status: e.status });
    return handleRouteError(e);
  }
}
