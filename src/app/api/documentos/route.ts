import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  const causaId = new URL(req.url).searchParams.get("causaId");
  const documentos = await prisma.documento.findMany({
    where: causaId ? { causaId } : undefined,
    include: { causa: true, autor: true },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(documentos);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const doc = await prisma.documento.create({
    data: {
      nombre: body.nombre,
      tipo: body.tipo || "otro",
      contenido: body.contenido || null,
      causaId: body.causaId || null,
      autorId: body.autorId || null,
    },
  });
  if (doc.causaId) {
    await prisma.activity.create({
      data: {
        tipo: "documento",
        mensaje: `Documento creado: ${doc.nombre}`,
        causaId: doc.causaId,
        userId: doc.autorId || undefined,
      },
    });
  }
  return NextResponse.json(doc, { status: 201 });
}
