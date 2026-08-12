import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { handleRouteError, requireStaff } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    const doc = await prisma.documento.findUnique({
      where: { id },
      select: {
        nombre: true,
        confidencial: true,
        privilegio: true,
        extractedMarkdown: true,
      },
    });
    if (!doc) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
    if (
      (doc.confidencial || doc.privilegio) &&
      !canSeeConfidential(user.role)
    ) {
      return NextResponse.json({ error: "Documento confidencial" }, { status: 403 });
    }
    if (!doc.extractedMarkdown) {
      return NextResponse.json({ error: "No hay Markdown extraído" }, { status: 404 });
    }
    return new NextResponse(doc.extractedMarkdown, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `inline; filename="${encodeURIComponent(doc.nombre)}.md"`,
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
