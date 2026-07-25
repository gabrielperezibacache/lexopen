import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireSiteAccess, requireStaff, requireUser } from "@/lib/api";
import { siteFileWhereForRole } from "@/lib/auth/access";
import { assertUploadSize, newStorageKey, putObject } from "@/lib/storage";

type Params = { params: Promise<{ id: string }> };
const LARGE_CONTENT_BYTES = 64 * 1024;

async function prepareFileBody(siteId: string, name: string, body: Record<string, unknown>) {
  const contenido = typeof body.contenido === "string" ? body.contenido : "";
  const contenidoBase64 =
    typeof body.contenidoBase64 === "string" ? body.contenidoBase64 : null;
  const mimeType = typeof body.mimeType === "string" ? body.mimeType : "text/markdown";
  const binary = contenidoBase64 ? Buffer.from(contenidoBase64, "base64") : null;
  const sizeBytes = binary?.length ?? Buffer.byteLength(contenido, "utf8");
  assertUploadSize(sizeBytes);
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

async function parseFileRequest(req: NextRequest) {
  const contentType = req.headers.get("content-type") || "";
  if (!contentType.includes("multipart/form-data")) {
    return (await req.json()) as Record<string, unknown>;
  }

  const form = await req.formData();
  const file = form.get("file");
  const body: Record<string, unknown> = {
    action: String(form.get("action") || (file instanceof File ? "create-file" : "create-folder")),
    name: String(form.get("name") || (file instanceof File ? file.name : "")),
    folderId: String(form.get("folderId") || "") || null,
    tags: String(form.get("tags") || ""),
    contenido: String(form.get("contenido") || ""),
    confidencial: form.get("confidencial") === "on",
    privilegio: form.get("privilegio") === "on",
  };

  if (file instanceof File && file.size > 0) {
    assertUploadSize(file.size);
    body.name = body.name || file.name;
    body.mimeType = file.type || "application/octet-stream";
    body.contenidoBase64 = Buffer.from(await file.arrayBuffer()).toString("base64");
  }

  return body;
}

function stringField(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    const fileWhere = siteFileWhereForRole(user.role);
    const folders = await prisma.folder.findMany({
      where: { siteId: id },
      include: {
        files: { where: fileWhere, orderBy: { name: "asc" } },
        children: true,
      },
      orderBy: { name: "asc" },
    });
    const rootFiles = await prisma.siteFile.findMany({
      where: { siteId: id, folderId: null, ...fileWhere },
      include: { versions: { orderBy: { version: "desc" }, take: 3 }, comments: true },
      orderBy: { name: "asc" },
    });
    return NextResponse.json({ folders, rootFiles });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    await requireSiteAccess(id, user);
    const body = await parseFileRequest(req);
    const action = stringField(body.action);
    const name = stringField(body.name).trim();
    const folderId = stringField(body.folderId) || null;

    if (action === "create-folder") {
      if (!name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
      const parentId = stringField(body.parentId) || null;
      if (parentId) {
        const parent = await prisma.folder.findFirst({
          where: { id: parentId, siteId: id },
          select: { id: true },
        });
        if (!parent) return NextResponse.json({ error: "Carpeta no encontrada" }, { status: 404 });
      }
      const folder = await prisma.folder.create({
        data: {
          name,
          siteId: id,
          parentId,
        },
      });
      return NextResponse.json(folder, { status: 201 });
    }

    if (action === "upload-file" || action === "create-file") {
      if (!name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
      if (folderId) {
        const folder = await prisma.folder.findFirst({
          where: { id: folderId, siteId: id },
          select: { id: true },
        });
        if (!folder) return NextResponse.json({ error: "Carpeta no encontrada" }, { status: 404 });
      }
      const prepared = await prepareFileBody(id, name, body);
      const file = await prisma.siteFile.create({
        data: {
          name,
          mimeType: prepared.mimeType,
          contenido: prepared.contenido,
          storageKey: prepared.storageKey,
          sizeBytes: prepared.sizeBytes,
          confidencial: Boolean(body.confidencial),
          privilegio: Boolean(body.privilegio),
          siteId: id,
          folderId,
          tags: stringField(body.tags),
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

    if (action === "new-version" && body.fileId) {
      const fileId = stringField(body.fileId);
      const existing = await prisma.siteFile.findFirst({ where: { id: fileId, siteId: id } });
      if (!existing) return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
      const version = existing.version + 1;
      const prepared = await prepareFileBody(id, name || existing.name, {
        ...body,
        mimeType: stringField(body.mimeType, existing.mimeType),
        contenido: stringField(body.contenido, existing.contenido ?? ""),
      });
      const file = await prisma.siteFile.update({
        where: { id: existing.id },
        data: {
          version,
          contenido: prepared.contenido,
          storageKey: prepared.storageKey || existing.storageKey,
          sizeBytes: prepared.sizeBytes,
          confidencial:
            body.confidencial !== undefined ? Boolean(body.confidencial) : existing.confidencial,
          privilegio:
            body.privilegio !== undefined ? Boolean(body.privilegio) : existing.privilegio,
          versions: {
            create: {
              version,
              contenido: prepared.contenido,
              note: stringField(body.note, `Versión ${version}`),
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
