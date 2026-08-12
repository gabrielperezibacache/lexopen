import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireSiteAccess, requireUser } from "@/lib/api";
import { clientVisibleFileWhere } from "@/lib/auth/access";
import { isClientSharedTag } from "@/lib/auth/client-tags";
import { canSeeConfidential, isCliente } from "@/lib/auth/rbac";
import { MAX_STORAGE_OBJECT_BYTES, newStorageKey, putObject } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };
const LARGE_CONTENT_BYTES = 64 * 1024;

async function prepareFileBody(siteId: string, name: string, body: Record<string, unknown>) {
  const contenido = typeof body.contenido === "string" ? body.contenido : "";
  const contenidoBase64 =
    typeof body.contenidoBase64 === "string" ? body.contenidoBase64 : null;
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "text/markdown";
  if (contenidoBase64 && !/^[A-Za-z0-9+/]*={0,2}$/.test(contenidoBase64)) {
    const error = new Error("contenidoBase64 inválido") as Error & { status: number };
    error.status = 400;
    throw error;
  }
  if (
    contenidoBase64 &&
    contenidoBase64.length > Math.ceil((MAX_STORAGE_OBJECT_BYTES * 4) / 3) + 4
  ) {
    const error = new Error(
      `El archivo supera el límite de ${MAX_STORAGE_OBJECT_BYTES} bytes`
    ) as Error & { status: number };
    error.status = 413;
    throw error;
  }
  const binary = contenidoBase64 ? Buffer.from(contenidoBase64, "base64") : null;
  const sizeBytes = binary?.length ?? Buffer.byteLength(contenido, "utf8");
  if (sizeBytes > MAX_STORAGE_OBJECT_BYTES) {
    const error = new Error(
      `El archivo supera el límite de ${MAX_STORAGE_OBJECT_BYTES} bytes`
    ) as Error & { status: number };
    error.status = 413;
    throw error;
  }
  const shouldStore = Boolean(binary) || sizeBytes > LARGE_CONTENT_BYTES;

  if (!shouldStore) {
    return { contenido, storageKey: null as string | null, sizeBytes, mimeType };
  }

  const key = newStorageKey(`sites/${siteId}`, name);
  await putObject({
    key,
    body: binary ?? contenido,
    contentType: mimeType,
  });
  return { contenido: null, storageKey: key, sizeBytes, mimeType };
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    const fileWhere = clientVisibleFileWhere(user.role);
    const clientView = isCliente(user.role);
    const folders = await prisma.folder.findMany({
      where: { siteId: id },
      include: {
        files: {
          where: fileWhere,
          orderBy: { name: "asc" },
          select: {
            id: true,
            name: true,
            mimeType: true,
            tags: true,
            version: true,
            sizeBytes: true,
            confidencial: true,
            privilegio: true,
            folderId: true,
            siteId: true,
            storageKey: true,
            updatedAt: true,
            createdAt: true,
            // Never return body content in list payloads.
            contenido: false,
          },
        },
        children: true,
      },
      orderBy: { name: "asc" },
    });
    const rootFiles = await prisma.siteFile.findMany({
      where: { siteId: id, folderId: null, ...fileWhere },
      include: {
        versions: {
          orderBy: { version: "desc" },
          take: 3,
          select: {
            id: true,
            version: true,
            note: true,
            createdAt: true,
            authorId: true,
            contenido: false,
          },
        },
        comments: true,
      },
      orderBy: { name: "asc" },
    });
    if (clientView) {
      const filterClient = <T extends { tags: string }>(rows: T[]) =>
        rows.filter((f) => isClientSharedTag(f.tags));
      return NextResponse.json({
        folders: folders.map((folder) => ({
          ...folder,
          files: filterClient(folder.files),
        })),
        rootFiles: filterClient(rootFiles),
      });
    }
    return NextResponse.json({ folders, rootFiles });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const declaredLength = Number(req.headers.get("content-length") || 0);
    if (declaredLength > MAX_STORAGE_OBJECT_BYTES * 2) {
      return NextResponse.json(
        { error: `La solicitud supera el límite de ${MAX_STORAGE_OBJECT_BYTES} bytes` },
        { status: 413 }
      );
    }
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    const body = await req.json();
    if (isCliente(user.role)) {
      return NextResponse.json(
        { error: "El portal cliente no permite modificar archivos" },
        { status: 403 }
      );
    }
    if (
      !canSeeConfidential(user.role) &&
      (Boolean(body.confidencial) || Boolean(body.privilegio))
    ) {
      return NextResponse.json(
        { error: "Su rol no puede crear contenido confidencial o privilegiado" },
        { status: 403 }
      );
    }

    if (body.action === "create-folder") {
      if (body.parentId) {
        const parent = await prisma.folder.findFirst({
          where: { id: body.parentId, siteId: id },
          select: { id: true },
        });
        if (!parent) return NextResponse.json({ error: "Carpeta no encontrada" }, { status: 404 });
      }
      const folder = await prisma.folder.create({
        data: {
          name: body.name,
          siteId: id,
          parentId: body.parentId || null,
        },
      });
      return NextResponse.json(folder, { status: 201 });
    }

    if (body.action === "upload-file" || body.action === "create-file") {
      if (typeof body.name !== "string" || !body.name.trim() || body.name.length > 255) {
        return NextResponse.json({ error: "Nombre de archivo inválido" }, { status: 400 });
      }
      if (body.folderId) {
        const folder = await prisma.folder.findFirst({
          where: { id: body.folderId, siteId: id },
          select: { id: true },
        });
        if (!folder) return NextResponse.json({ error: "Carpeta no encontrada" }, { status: 404 });
      }
      const prepared = await prepareFileBody(id, body.name, body);
      const file = await prisma.siteFile.create({
        data: {
          name: body.name,
          mimeType: prepared.mimeType,
          contenido: prepared.contenido,
          storageKey: prepared.storageKey,
          sizeBytes: prepared.sizeBytes,
          confidencial: Boolean(body.confidencial),
          privilegio: Boolean(body.privilegio),
          siteId: id,
          folderId: body.folderId || null,
          tags: body.tags || "",
          metadataJson: JSON.stringify(body.metadata || {}),
          versions: {
            create: {
              version: 1,
              contenido: prepared.contenido,
              note: "Versión inicial",
              authorId: user.id,
            },
          },
        },
      });
      await prisma.activity.create({
        data: {
          tipo: "documento",
          mensaje: `Archivo cargado: ${file.name}`,
          siteId: id,
          userId: user.id,
        },
      });
      return NextResponse.json(file, { status: 201 });
    }

    if (body.action === "new-version" && body.fileId) {
      const existing = await prisma.siteFile.findFirst({ where: { id: body.fileId, siteId: id } });
      if (!existing) return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
      if (existing.confidencial || existing.privilegio) {
        if (!canSeeConfidential(user.role)) {
          return NextResponse.json({ error: "Archivo confidencial" }, { status: 403 });
        }
      }
      if (body.contenido === undefined && body.contenidoBase64 === undefined) {
        return NextResponse.json(
          { error: "Una nueva versión requiere contenido" },
          { status: 400 }
        );
      }
      const version = existing.version + 1;
      const prepared = await prepareFileBody(id, body.name || existing.name, {
        ...body,
        mimeType: body.mimeType || existing.mimeType,
      });
      const file = await prisma.siteFile.update({
        where: { id: existing.id },
        data: {
          version,
          contenido: prepared.contenido,
          storageKey: prepared.storageKey,
          sizeBytes: prepared.sizeBytes,
          confidencial:
            body.confidencial !== undefined ? Boolean(body.confidencial) : existing.confidencial,
          privilegio:
            body.privilegio !== undefined ? Boolean(body.privilegio) : existing.privilegio,
          versions: {
            create: {
              version,
              contenido: prepared.contenido,
              note: body.note || `Versión ${version}`,
              authorId: user.id,
            },
          },
        },
        include: { versions: { orderBy: { version: "desc" } } },
      });
      return NextResponse.json(file);
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (e) {
    return handleRouteError(e);
  }
}
