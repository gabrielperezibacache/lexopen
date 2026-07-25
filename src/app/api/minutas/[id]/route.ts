import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { pushMinutaToDrive } from "@/lib/integrations/google";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const minuta = await prisma.minuta.findUnique({
    where: { id },
    include: {
      causa: {
        include: {
          cliente: true,
          abogado: true,
          partes: true,
        },
      },
      autor: true,
      acciones: { orderBy: [{ estado: "asc" }, { fechaLimite: "asc" }] },
      documento: true,
    },
  });
  if (!minuta) {
    return NextResponse.json({ error: "Minuta no encontrada" }, { status: 404 });
  }
  return NextResponse.json(minuta);
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();

  if (body.action === "push-drive") {
    try {
      const result = await pushMinutaToDrive(id);
      return NextResponse.json(result);
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Error Drive" },
        { status: 400 }
      );
    }
  }

  if (body.action === "accion-estado" && body.accionId && body.estado) {
    const accion = await prisma.minutaAccion.update({
      where: { id: body.accionId },
      data: { estado: body.estado },
    });
    if (accion.taskId && body.estado === "hecha") {
      await prisma.task.update({
        where: { id: accion.taskId },
        data: { status: "done" },
      });
    }
    if (accion.plazoId && body.estado === "hecha") {
      await prisma.plazo.update({
        where: { id: accion.plazoId },
        data: { estado: "cumplido" },
      });
    }
    return NextResponse.json(accion);
  }

  const minuta = await prisma.minuta.update({
    where: { id },
    data: {
      titulo: body.titulo,
      resumenEjecutivo: body.resumenEjecutivo,
      hechosRelevantes: body.hechosRelevantes,
      acuerdos: body.acuerdos,
      proximosPasos: body.proximosPasos,
      riesgosAlertas: body.riesgosAlertas,
      estadoCausaNota: body.estadoCausaNota,
      participantes: body.participantes,
      lugar: body.lugar,
      modalidad: body.modalidad,
      confidencial: body.confidencial,
    },
  });

  return NextResponse.json(minuta);
}
