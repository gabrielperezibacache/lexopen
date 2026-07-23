import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const folders = await prisma.folder.findMany({
    where: { siteId: id },
    include: {
      files: { orderBy: { name: "asc" } },
      children: true,
    },
    orderBy: { name: "asc" },
  });
  const rootFiles = await prisma.siteFile.findMany({
    where: { siteId: id, folderId: null },
    include: { versions: { orderBy: { version: "desc" }, take: 3 }, comments: true },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ folders, rootFiles });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  const body = await req.json();

  if (body.action === "create-folder") {
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
    const file = await prisma.siteFile.create({
      data: {
        name: body.name,
        mimeType: body.mimeType || "text/markdown",
        contenido: body.contenido || "",
        sizeBytes: (body.contenido || "").length,
        siteId: id,
        folderId: body.folderId || null,
        tags: body.tags || "",
        metadataJson: JSON.stringify(body.metadata || {}),
        versions: {
          create: {
            version: 1,
            contenido: body.contenido || "",
            note: "Versión inicial",
            authorId: user?.id,
          },
        },
      },
    });
    await prisma.activity.create({
      data: {
        tipo: "documento",
        mensaje: `Archivo cargado: ${file.name}`,
        siteId: id,
        userId: user?.id,
      },
    });
    return NextResponse.json(file, { status: 201 });
  }

  if (body.action === "new-version" && body.fileId) {
    const existing = await prisma.siteFile.findUnique({ where: { id: body.fileId } });
    if (!existing) return NextResponse.json({ error: "Archivo no encontrado" }, { status: 404 });
    const version = existing.version + 1;
    const file = await prisma.siteFile.update({
      where: { id: existing.id },
      data: {
        version,
        contenido: body.contenido ?? existing.contenido,
        sizeBytes: (body.contenido ?? existing.contenido ?? "").length,
        versions: {
          create: {
            version,
            contenido: body.contenido ?? existing.contenido,
            note: body.note || `Versión ${version}`,
            authorId: user?.id,
          },
        },
      },
      include: { versions: { orderBy: { version: "desc" } } },
    });
    return NextResponse.json(file);
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
