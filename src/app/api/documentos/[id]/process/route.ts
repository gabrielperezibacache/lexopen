import { assertCsrf, canReadFlagged, handleRouteError, requireStaff } from "@/lib/api";
import { assertCausaCapability, documentReadWhere as scopeddocumentReadWhere } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { documentProcessingReset, enqueueDocumentProcessing } from "@/lib/document-processing-queue";
import { getObject } from "@/lib/storage";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const document = await prisma.documento.findFirst({
      where: { AND: [scopeddocumentReadWhere(user), { id }] },
      select: {
        id: true,
        causaId: true,
        nombre: true,
        contenido: true,
        storageKey: true,
        confidencial: true,
        privilegio: true,
      },
    });
    if (!document) return NextResponse.json({ error: "Documento no encontrado" }, { status: 404 });
    if (
      !canReadFlagged(user, document)
    ) {
      return NextResponse.json({ error: "Documento confidencial" }, { status: 403 });
    }

    if (document.causaId) await assertCausaCapability(document.causaId, user, "causa.write");
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
        ...documentProcessingReset,
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
