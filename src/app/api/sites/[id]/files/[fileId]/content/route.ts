import { canReadFlagged, handleRouteError, requireSiteAccess, requireUser } from "@/lib/api";
import { siteFileReadWhere as scopedsiteFileReadWhere } from "@/lib/auth/causa-access";
import { isClientSharedTag } from "@/lib/auth/client-tags";
import { isCliente } from "@/lib/auth/rbac";
import { prisma } from "@/lib/db";
import { downloadResponseHeaders } from "@/lib/security/download";
import { getObject } from "@/lib/storage";
import { NextResponse } from "next/server";

type Params = { params: Promise<{ id: string; fileId: string }> };

export async function GET(_req: Request, { params }: Params) {
  try {
    const user = await requireUser();
    const { id, fileId } = await params;
    await requireSiteAccess(id, user);
    const file = await prisma.siteFile.findFirst({
      where: { AND: [scopedsiteFileReadWhere(user), { id: fileId, siteId: id }] },
    });
    if (!file) {
      return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
    }
    if (
      !canReadFlagged(user, file)
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
      headers: downloadResponseHeaders(file.name, file.mimeType),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
