import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get("q")?.trim();
  const materia = searchParams.get("materia");
  const estado = searchParams.get("estado");

  const causas = await prisma.causa.findMany({
    where: {
      AND: [
        q
          ? {
              OR: [
                { titulo: { contains: q } },
                { rit: { contains: q } },
                { ruc: { contains: q } },
                { caratula: { contains: q } },
                { tribunal: { contains: q } },
              ],
            }
          : {},
        materia ? { materia } : {},
        estado ? { estado } : {},
      ],
    },
    include: {
      cliente: true,
      abogado: true,
      plazos: { where: { estado: "pendiente" }, orderBy: { fechaLimite: "asc" }, take: 2 },
      _count: { select: { documentos: true, partes: true } },
    },
    orderBy: { updatedAt: "desc" },
  });

  return NextResponse.json(causas);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const causa = await prisma.causa.create({
    data: {
      titulo: body.titulo,
      rit: body.rit || null,
      ruc: body.ruc || null,
      tribunal: body.tribunal,
      materia: body.materia,
      procedimiento: body.procedimiento || null,
      estado: body.estado || "activa",
      etapa: body.etapa || "ingreso",
      caratula: body.caratula || null,
      resumen: body.resumen || null,
      fechaIngreso: body.fechaIngreso ? new Date(body.fechaIngreso) : new Date(),
      clienteId: body.clienteId || null,
      abogadoId: body.abogadoId || null,
      partes: body.partes?.length
        ? {
            create: body.partes.map(
              (p: { nombre: string; rut?: string; rol: string }) => ({
                nombre: p.nombre,
                rut: p.rut || null,
                rol: p.rol,
              })
            ),
          }
        : undefined,
    },
    include: { partes: true, cliente: true, abogado: true },
  });

  await prisma.activity.create({
    data: {
      tipo: "estado",
      mensaje: `Nueva causa creada: ${causa.titulo}`,
      causaId: causa.id,
      userId: causa.abogadoId || undefined,
    },
  });

  return NextResponse.json(causa, { status: 201 });
}
