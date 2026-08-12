import { NextResponse } from "next/server";
import { canSeeConfidential, isCliente } from "@/lib/auth/rbac";
import { handleRouteError, requireSiteAccess, requireUser } from "@/lib/api";
import { prisma } from "@/lib/db";
import { getObject } from "@/lib/storage";

type Params = { params: Promise<{ id: string; fileId: string }> };

function isClientSharedTag(tags: string | null | undefined) {
  return (tags || "")
    .split(/[,;]+/)
    .map((t) => t.trim().toLowerCase())
    .includes("cliente");
}

export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id, fileId } = await params;
    await requireSiteAccess(id, user);
    const file = await prisma.siteFile.findFirst({
      where: { id: fileId, siteId: id },
    });
    if (!file) {
      return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
    }
    if (
      (file.confidencial || file.privilegio) &&
      !canSeeConfidential(user.role)
    ) {
      return NextResponse.json({ error: "Archivo confidencial" }, { status: 403 });
    }
    if (isCliente(user.role) && !isClientSharedTag(file.tags)) {
      return NextResponse.json(
        { error: "Archivo no compartido con el portal cliente" },
        { status: 403 }
      );
    }
    const body = file.storageKey
      ? await getObject(file.storageKey)
      : Buffer.from(file.contenido || "");
    if (!body) {
      return NextResponse.json({ error: "Contenido no encontrado" }, { status: 404 });
    }
    return new NextResponse(body as BodyInit, {
      headers: {
        "Content-Type": file.mimeType || "application/octet-stream",
        "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`,
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
