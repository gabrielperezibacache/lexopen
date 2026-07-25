import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const causa = await prisma.causa.findUnique({
    where: { id },
    include: {
      cliente: true,
      abogado: true,
      partes: true,
      documentos: { orderBy: { updatedAt: "desc" } },
      plazos: { orderBy: { fechaLimite: "asc" } },
      notas: { orderBy: { updatedAt: "desc" } },
      minutas: {
        include: {
          autor: { select: { id: true, name: true } },
          acciones: true,
        },
        orderBy: { fecha: "desc" },
        take: 20,
      },
      actividades: {
        include: { user: true },
        orderBy: { createdAt: "desc" },
        take: 30,
      },
    },
  });
  if (!causa) return NextResponse.json({ error: "No encontrada" }, { status: 404 });
  return NextResponse.json(causa);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  // Drive solo vía /api/integrations/google (link/create/unlink)
  const data: Record<string, unknown> = {};
  for (const key of [
    "titulo",
    "rit",
    "ruc",
    "tribunal",
    "materia",
    "procedimiento",
    "estado",
    "etapa",
    "caratula",
    "resumen",
    "clienteId",
    "abogadoId",
  ] as const) {
    if (body[key] !== undefined) data[key] = body[key];
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json(
      { error: "Sin campos para actualizar" },
      { status: 400 }
    );
  }

  const causa = await prisma.causa.update({
    where: { id },
    data,
  });

  if (body.estado || body.etapa) {
    await prisma.activity.create({
      data: {
        tipo: "estado",
        mensaje: `Actualización: estado=${causa.estado}, etapa=${causa.etapa}`,
        causaId: causa.id,
      },
    });
  }

  return NextResponse.json(causa);
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  await prisma.causa.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
