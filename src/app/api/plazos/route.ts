import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const plazos = await prisma.plazo.findMany({
    include: { causa: true, responsable: true },
    orderBy: { fechaLimite: "asc" },
  });
  return NextResponse.json(plazos);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const plazo = await prisma.plazo.create({
    data: {
      titulo: body.titulo,
      descripcion: body.descripcion || null,
      fechaLimite: new Date(body.fechaLimite),
      tipo: body.tipo || "procesal",
      estado: body.estado || "pendiente",
      causaId: body.causaId || null,
      responsableId: body.responsableId || null,
    },
  });
  if (plazo.causaId) {
    await prisma.activity.create({
      data: {
        tipo: "plazo",
        mensaje: `Plazo: ${plazo.titulo} (${plazo.fechaLimite.toISOString().slice(0, 10)})`,
        causaId: plazo.causaId,
        userId: plazo.responsableId || undefined,
      },
    });
  }
  return NextResponse.json(plazo, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const plazo = await prisma.plazo.update({
    where: { id: body.id },
    data: { estado: body.estado },
  });
  return NextResponse.json(plazo);
}
