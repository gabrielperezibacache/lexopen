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
  const causa = await prisma.causa.update({
    where: { id },
    data: {
      titulo: body.titulo,
      rit: body.rit,
      ruc: body.ruc,
      tribunal: body.tribunal,
      materia: body.materia,
      procedimiento: body.procedimiento,
      estado: body.estado,
      etapa: body.etapa,
      caratula: body.caratula,
      resumen: body.resumen,
      clienteId: body.clienteId,
      abogadoId: body.abogadoId,
    },
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
