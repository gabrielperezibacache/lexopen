import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { enqueueDocumentProcessing } from "@/lib/document-processing-queue";
import { getObject } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const document = await prisma.documento.findUnique({
      where: { id },
      select: {
        id: true,
        nombre: true,
        contenido: true,
        storageKey: true,
        confidencial: true,
        privilegio: true,
      },
    });
    if (!document) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
    if (
      (document.confidencial || document.privilegio) &&
      !canSeeConfidential(user.role)
    ) {
      return NextResponse.json({ error: "Documento confidencial" }, { status: 403 });
    }

    const bytes = document.storageKey
      ? await getObject(document.storageKey)
      : document.contenido
        ? Buffer.from(document.contenido, "utf8")
        : null;
    if (!bytes) {
      return NextResponse.json({ error: "Contenido no encontrado" }, { status: 404 });
    }
    await prisma.documento.update({
      where: { id },
      data: {
        extractionStatus: "pending",
        extractionJson: JSON.stringify({ requestedBy: user.id }),
      },
    });
    enqueueDocumentProcessing({
      id: document.id,
      name: document.nombre,
      bytes,
    });
    return NextResponse.json({ ok: true, status: "pending" });
  } catch (e) {
    return handleRouteError(e);
  }
}
