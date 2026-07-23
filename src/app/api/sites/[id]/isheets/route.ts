import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const sheets = await prisma.iSheet.findMany({
    where: { siteId: id },
    include: {
      columns: { orderBy: { position: "asc" } },
      rows: { orderBy: { createdAt: "asc" } },
      _count: { select: { rows: true } },
    },
  });
  return NextResponse.json(sheets);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  const body = await req.json();

  if (body.action === "create-sheet") {
    const sheet = await prisma.iSheet.create({
      data: {
        name: body.name,
        description: body.description || null,
        siteId: id,
        columns: {
          create: (body.columns || [
            { name: "Título", key: "titulo", type: "text", position: 0 },
            { name: "Estado", key: "estado", type: "choice", options: "Pendiente,En curso,Hecho", position: 1 },
            { name: "Fecha", key: "fecha", type: "date", position: 2 },
          ]).map(
            (
              c: { name: string; key: string; type?: string; options?: string; position?: number },
              i: number
            ) => ({
              name: c.name,
              key: c.key,
              type: c.type || "text",
              options: c.options || "",
              position: c.position ?? i,
            })
          ),
        },
      },
      include: { columns: true },
    });
    await prisma.activity.create({
      data: {
        tipo: "sistema",
        mensaje: `iSheet creada: ${sheet.name}`,
        siteId: id,
        userId: user?.id,
      },
    });
    return NextResponse.json(sheet, { status: 201 });
  }

  if (body.action === "add-row" && body.sheetId) {
    const row = await prisma.iSheetRow.create({
      data: {
        sheetId: body.sheetId,
        dataJson: JSON.stringify(body.data || {}),
      },
    });
    return NextResponse.json(row, { status: 201 });
  }

  if (body.action === "update-row" && body.rowId) {
    const row = await prisma.iSheetRow.update({
      where: { id: body.rowId },
      data: { dataJson: JSON.stringify(body.data || {}) },
    });
    return NextResponse.json(row);
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
