import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { clienteCreateSchema } from "@/lib/schemas";
import { parseListLimit } from "@/lib/api/list-limit";
import { clienteListInclude } from "@/lib/clientes/list";
import { createClienteCommand } from "@/lib/clientes/commands";
import { requestCommandKey } from "@/lib/command-execution";

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const sp = new URL(req.url).searchParams;
    const q = sp.get("q")?.trim();
    const estado = sp.get("estado")?.trim();
    const limit = parseListLimit(sp.get("limit"), { default: 200, max: 500 });

    const clientes = await prisma.cliente.findMany({
      where: {
        AND: [
          estado ? { estado } : {},
          q
            ? {
                OR: [
                  { razonSocial: { contains: q, mode: "insensitive" } },
                  { rut: { contains: q, mode: "insensitive" } },
                  { email: { contains: q, mode: "insensitive" } },
                ],
              }
            : {},
        ],
      },
      include: clienteListInclude(user),
      orderBy: { updatedAt: "desc" },
      take: limit,
    });

    const items = clientes.map((c) => ({
      id: c.id,
      razonSocial: c.razonSocial,
      rut: c.rut,
      email: c.email,
      telefono: c.telefono,
      tipo: c.tipo,
      estado: c.estado,
      notas: c.notas,
      abogado: c.abogado,
      causasCount: c._count.causas,
      documentosCount: c._count.documentos,
      tramitesPendientes: c.causas.reduce(
        (n, causa) => n + causa._count.tramites,
        0
      ),
      updatedAt: c.updatedAt,
    }));

    return NextResponse.json(items);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await parseBody(req, clienteCreateSchema);
    const cliente = await createClienteCommand(user, body, requestCommandKey(req, "cliente.create"));
    return NextResponse.json(cliente, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
