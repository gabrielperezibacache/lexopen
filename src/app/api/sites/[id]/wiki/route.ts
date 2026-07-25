import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, requireSiteAccess, requireUser } from "@/lib/api";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    const pages = await prisma.wikiPage.findMany({
      where: { siteId: id },
      include: { author: true },
      orderBy: { title: "asc" },
    });
    return NextResponse.json(pages);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
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
