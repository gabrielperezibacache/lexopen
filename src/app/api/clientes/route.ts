import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { clienteCreateSchema } from "@/lib/schemas";
import { writeAudit } from "@/lib/audit";
import { TRAMITES_ABIERTOS } from "@/lib/tramites";

export async function GET(req: NextRequest) {
  try {
    await requireStaff();
    const sp = new URL(req.url).searchParams;
    const q = sp.get("q")?.trim();
    const estado = sp.get("estado")?.trim();

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
      include: {
        abogado: { select: { id: true, name: true } },
        _count: {
          select: {
            causas: true,
            documentos: true,
          },
        },
        causas: {
          select: {
            id: true,
            _count: {
              select: {
                tramites: {
                  where: { estado: { in: [...TRAMITES_ABIERTOS] } },
                },
              },
            },
          },
        },
      },
      orderBy: { updatedAt: "desc" },
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
    const email =
      body.email === "" || body.email == null ? null : body.email;

    const cliente = await prisma.cliente.create({
      data: {
        razonSocial: body.razonSocial.trim(),
        rut: body.rut || null,
        email,
        telefono: body.telefono || null,
        tipo: body.tipo || "persona",
        estado: body.estado || "activo",
        notas: body.notas || null,
        abogadoId: body.abogadoId || null,
      },
    });

    await writeAudit({
      actorId: user.id,
      action: "cliente.create",
      entityType: "Cliente",
      entityId: cliente.id,
      after: cliente,
    });

    return NextResponse.json(cliente, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
