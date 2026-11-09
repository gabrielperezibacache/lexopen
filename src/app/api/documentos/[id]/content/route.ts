import { canReadFlagged, handleRouteError, requireStaff } from "@/lib/api";
import { documentReadWhere as scopeddocumentReadWhere } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { documentBodyForDownload, downloadResponseHeaders } from "@/lib/security/download";
import { getObject } from "@/lib/storage";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    const doc = await prisma.documento.findFirst({ where: { AND: [scopeddocumentReadWhere(user), { id }] } });
    if (!doc) {
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
    }
    if (
      !canReadFlagged(user, doc)
    ) {
      return NextResponse.json({ error: "Documento confidencial" }, { status: 403 });
    }

    const body = documentBodyForDownload(doc, doc.storageKey ? await getObject(doc.storageKey) : null);
    if (!body) {
      return NextResponse.json({ error: "Contenido no encontrado" }, { status: 404 });
    }

    return new NextResponse(body as BodyInit, {
      headers: downloadResponseHeaders(doc.nombre, doc.mimeType),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
