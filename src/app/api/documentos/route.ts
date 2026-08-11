import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  confidentialWhere,
  assertCsrf,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { documentoCreateSchema } from "@/lib/schemas";
import { MAX_STORAGE_OBJECT_BYTES, newStorageKey, putObject } from "@/lib/storage";
import { writeAudit } from "@/lib/audit";
import { canSeeConfidential } from "@/lib/auth/rbac";
import { publicUserSelect } from "@/lib/auth/public-user";

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const causaId = new URL(req.url).searchParams.get("causaId");
    const documentos = await prisma.documento.findMany({
      where: {
        ...(causaId ? { causaId } : {}),
        ...confidentialWhere(user.role),
      },
      include: { causa: true, autor: { select: publicUserSelect } },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(documentos);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const isMultipart = req.headers.get("content-type")?.includes("multipart/form-data");
    const body = isMultipart
      ? null
      : await parseBody(req, documentoCreateSchema);

    let nombre = body?.nombre || "";
    let tipo = body?.tipo || "otro";
    let contenido = body?.contenido || null;
    let mimeType = body?.mimeType || null;
    let storageKey: string | null = null;
    let confidencial = Boolean(body?.confidencial);
    let privilegio = Boolean(body?.privilegio);
    let causaId = body?.causaId || null;
    const autorId = user.id;

    if (!canSeeConfidential(user.role) && (confidencial || privilegio)) {
      return NextResponse.json(
        { error: "Su rol no puede crear contenido confidencial o privilegiado" },
        { status: 403 }
      );
    }

    if (isMultipart) {
      const form = await req.formData();
      const file = form.get("file");
      nombre = String(form.get("nombre") || "");
      tipo = String(form.get("tipo") || "otro");
      confidencial = form.get("confidencial") === "on";
      privilegio = form.get("privilegio") === "on";
      causaId = String(form.get("causaId") || "") || null;
      if (!canSeeConfidential(user.role) && (confidencial || privilegio)) {
        return NextResponse.json(
          { error: "Su rol no puede crear contenido confidencial o privilegiado" },
          { status: 403 }
        );
      }
      if (file && typeof (file as File).arrayBuffer === "function" && (file as File).size > 0) {
        const uploaded = file as File;
        if (uploaded.size > MAX_STORAGE_OBJECT_BYTES) {
          return NextResponse.json(
            { error: `El archivo supera el límite de ${MAX_STORAGE_OBJECT_BYTES} bytes` },
            { status: 413 }
          );
        }
        nombre = nombre || uploaded.name;
        mimeType = uploaded.type || "application/octet-stream";
        const key = newStorageKey("documentos", nombre);
        await putObject({
          key,
          body: Buffer.from(await uploaded.arrayBuffer()),
          contentType: mimeType,
        });
        storageKey = key;
      }
      if (!storageKey) {
        contenido = String(form.get("contenido") || "");
        mimeType = mimeType || "text/plain";
      }
    }

    if (!nombre) {
      return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
    }

    if (contenido && !storageKey) {
      const key = newStorageKey("documentos", nombre);
      await putObject({
        key,
        body: contenido,
        contentType: mimeType || "text/markdown",
      });
      storageKey = key;
    }

    const doc = await prisma.documento.create({
      data: {
        nombre,
        tipo,
        contenido,
        mimeType,
        storageKey,
        confidencial,
        privilegio,
        causaId,
        autorId,
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
