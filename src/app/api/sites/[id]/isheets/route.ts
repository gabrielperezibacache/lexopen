import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireSiteAccess, requireUser } from "@/lib/api";
import { isCliente } from "@/lib/auth/rbac";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    if (isCliente(user.role)) {
      return NextResponse.json(
        { error: "Acceso restringido al portal cliente" },
        { status: 403 }
      );
    }
    const sheets = await prisma.iSheet.findMany({
      where: { siteId: id },
      include: {
        columns: { orderBy: { position: "asc" } },
        rows: { orderBy: { createdAt: "asc" } },
        _count: { select: { rows: true } },
      },
    });
    return NextResponse.json(sheets);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    if (isCliente(user.role)) {
      return NextResponse.json({ error: "Clientes no pueden editar iSheets" }, { status: 403 });
    }
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
          userId: user.id,
        },
      });
      return NextResponse.json(sheet, { status: 201 });
    }

    if (body.action === "add-row" && body.sheetId) {
      const sheet = await prisma.iSheet.findFirst({
        where: { id: body.sheetId, siteId: id },
        select: { id: true },
      });
      if (!sheet) return NextResponse.json({ error: "iSheet no encontrada" }, { status: 404 });
      const row = await prisma.iSheetRow.create({
        data: {
          sheetId: body.sheetId,
          dataJson: JSON.stringify(body.data || {}),
        },
      });
      return NextResponse.json(row, { status: 201 });
    }

    if (body.action === "update-row" && body.rowId) {
      const existing = await prisma.iSheetRow.findFirst({
        where: { id: body.rowId, sheet: { siteId: id } },
        select: { id: true },
      });
      if (!existing) return NextResponse.json({ error: "Fila no encontrada" }, { status: 404 });
      const row = await prisma.iSheetRow.update({
        where: { id: existing.id },
        data: { dataJson: JSON.stringify(body.data || {}) },
      });
      return NextResponse.json(row);
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (e) {
    return handleRouteError(e);
  }
}
