import { canReadFlagged, handleRouteError, requireStaff } from "@/lib/api";
import { documentReadWhere as scopeddocumentReadWhere } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { downloadResponseHeaders } from "@/lib/security/download";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    const doc = await prisma.documento.findFirst({
      where: { AND: [scopeddocumentReadWhere(user), { id }] },
      select: {
        nombre: true,
        confidencial: true,
        privilegio: true,
        extractedMarkdown: true,
      },
    });
    if (!doc) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
    if (
      !canReadFlagged(user, doc)
    ) {
      return NextResponse.json({ error: "Documento confidencial" }, { status: 403 });
    }
    if (!doc.extractedMarkdown) {
      return NextResponse.json({ error: "No hay Markdown extraído" }, { status: 404 });
    }
    return new NextResponse(doc.extractedMarkdown, {
      headers: downloadResponseHeaders(`${doc.nombre}.md`, "text/markdown"),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
