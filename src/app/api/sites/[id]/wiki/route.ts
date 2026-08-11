import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireSiteAccess, requireUser } from "@/lib/api";
import { isCliente } from "@/lib/auth/rbac";
import { publicUserSelect } from "@/lib/auth/public-user";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    const pages = await prisma.wikiPage.findMany({
      where: { siteId: id },
      include: { author: { select: publicUserSelect } },
      orderBy: { title: "asc" },
    });
    return NextResponse.json(pages);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    if (isCliente(user.role)) {
      return NextResponse.json({ error: "Clientes no pueden editar la wiki" }, { status: 403 });
    }
    const body = await req.json();
    const slug =
      body.slug ||
      String(body.title || "page")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-");

    const page = await prisma.wikiPage.create({
      data: {
        title: body.title,
        slug,
        content: body.content || "",
        siteId: id,
        authorId: user.id,
        published: body.published !== false,
      },
    });
    await prisma.activity.create({
      data: {
        tipo: "comentario",
        mensaje: `Wiki actualizada: ${page.title}`,
        siteId: id,
        userId: user.id,
      },
    });
    return NextResponse.json(page, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    if (isCliente(user.role)) {
      return NextResponse.json({ error: "Clientes no pueden editar la wiki" }, { status: 403 });
    }
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }
    const current = await prisma.wikiPage.findFirst({
      where: { id: body.id, siteId: id },
    });
    if (!current) {
      return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
    }
    const page = await prisma.wikiPage.update({
      where: { id: current.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.published !== undefined ? { published: Boolean(body.published) } : {}),
      },
    });
    await prisma.activity.create({
      data: {
        tipo: "comentario",
        mensaje: `Wiki editada: ${page.title}`,
        siteId: id,
        userId: user.id,
      },
    });
    return NextResponse.json(page);
  } catch (e) {
    return handleRouteError(e);
  }
}
