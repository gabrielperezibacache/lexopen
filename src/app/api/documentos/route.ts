import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  confidentialWhere,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { documentoCreateSchema } from "@/lib/schemas";
import { newStorageKey, putObject } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const causaId = new URL(req.url).searchParams.get("causaId");
    const documentos = await prisma.documento.findMany({
      where: {
        ...(causaId ? { causaId } : {}),
        ...confidentialWhere(user.role),
      },
      include: { causa: true, autor: true },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(documentos);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireStaff();
    const body = await parseBody(req, documentoCreateSchema);

    let storageKey = body.storageKey || null;
    if (body.contenido && !storageKey) {
      const key = newStorageKey("documentos", body.nombre);
      await putObject({
        key,
        body: body.contenido,
        contentType: body.mimeType || "text/markdown",
      });
      storageKey = key;
    }

    const doc = await prisma.documento.create({
      data: {
        nombre: body.nombre,
        tipo: body.tipo || "otro",
        contenido: body.contenido || null,
        mimeType: body.mimeType || null,
        storageKey,
        confidencial: Boolean(body.confidencial),
        privilegio: Boolean(body.privilegio),
        causaId: body.causaId || null,
        autorId: body.autorId || user.id,
      },
    });

    if (doc.causaId) {
      await prisma.activity.create({
        data: {
          tipo: "documento",
          mensaje: `Documento creado: ${doc.nombre}`,
          causaId: doc.causaId,
          userId: user.id,
        },
      });
    }
    await writeAudit({
      actorId: user.id,
      action: "documento.create",
      entityType: "Documento",
      entityId: doc.id,
      after: { nombre: doc.nombre, storageKey },
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}
