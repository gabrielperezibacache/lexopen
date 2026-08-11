import { NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    const doc = await prisma.documento.findUnique({ where: { id } });
    if (!doc) {
      return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
    }
    if (
      (doc.confidencial || doc.privilegio) &&
      !canSeeConfidential(user.role)
    ) {
      return NextResponse.json({ error: "Documento confidencial" }, { status: 403 });
    }

    const body = doc.storageKey ? await getObject(doc.storageKey) : Buffer.from(doc.contenido || "");
    if (!body) {
      return NextResponse.json({ error: "Contenido no encontrado" }, { status: 404 });
    }

    return new NextResponse(body as BodyInit, {
      headers: {
        "Content-Type": doc.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(doc.nombre)}"`,
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
