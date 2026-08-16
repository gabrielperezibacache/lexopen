import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireSiteAccess, requireUser } from "@/lib/api";
import { isCliente } from "@/lib/auth/rbac";
import { publicUserSelect } from "@/lib/auth/public-user";
import { writeAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

const wikiListSelect = {
  id: true,
  title: true,
  slug: true,
  published: true,
  updatedAt: true,
  createdAt: true,
  authorId: true,
  siteId: true,
};

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    if (isCliente(user.role)) {
      return NextResponse.json(
        { error: "Acceso restringido al portal cliente" },
        { status: 403 }
      );
    }
    const pageId = req.nextUrl.searchParams.get("id");
    if (pageId) {
      const page = await prisma.wikiPage.findFirst({
        where: { id: pageId, siteId: id },
        include: {
          author: { select: publicUserSelect },
          revisions: {
            orderBy: { createdAt: "desc" },
            take: 20,
            include: { author: { select: publicUserSelect } },
          },
        },
      });
      if (!page) {
        return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
      }
      return NextResponse.json(page);
    }
    const pages = await prisma.wikiPage.findMany({
      where: { siteId: id },
      select: {
        ...wikiListSelect,
        author: { select: publicUserSelect },
      },
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

    const page = await prisma.$transaction(async (tx) => {
      const created = await tx.wikiPage.create({
        data: {
          title: body.title,
          slug,
          content: body.content || "",
          siteId: id,
          authorId: user.id,
          published: body.published !== false,
        },
        select: {
          ...wikiListSelect,
          content: true,
        },
      });
      await tx.wikiPageRevision.create({
        data: {
          pageId: created.id,
          title: created.title,
          content: created.content,
          authorId: user.id,
        },
      });
      await tx.activity.create({
        data: {
          tipo: "comentario",
          mensaje: `Wiki creada: ${created.title}`,
          siteId: id,
          userId: user.id,
        },
      });
      return created;
    });

    await writeAudit({
      action: "wiki.create",
      entityType: "WikiPage",
      entityId: page.id,
      after: { detail: page.title },
      actorId: user.id,
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
      select: { id: true, title: true, content: true, published: true },
    });
    if (!current) {
      return NextResponse.json({ error: "Página no encontrada" }, { status: 404 });
    }

    // Restore: snapshot current state, then apply revision contents only.
    if (body.action === "restore" && body.revisionId) {
      const rev = await prisma.wikiPageRevision.findFirst({
        where: { id: body.revisionId, pageId: current.id },
      });
      if (!rev) {
        return NextResponse.json({ error: "Revisión no encontrada" }, { status: 404 });
      }
      const page = await prisma.$transaction(async (tx) => {
        await tx.wikiPageRevision.create({
          data: {
            pageId: current.id,
            title: current.title,
            content: current.content,
            authorId: user.id,
          },
        });
        return tx.wikiPage.update({
          where: { id: current.id },
          data: { title: rev.title, content: rev.content },
          select: {
            ...wikiListSelect,
            content: true,
          },
        });
      });
      await writeAudit({
        action: "wiki.restore",
        entityType: "WikiPage",
        entityId: page.id,
        after: { detail: `revision=${body.revisionId}` },
        actorId: user.id,
      });
      await prisma.activity.create({
        data: {
          tipo: "comentario",
          mensaje: `Wiki restaurada: ${page.title}`,
          siteId: id,
          userId: user.id,
        },
      });
      return NextResponse.json(page);
    }

    const page = await prisma.$transaction(async (tx) => {
      await tx.wikiPageRevision.create({
        data: {
          pageId: current.id,
          title: current.title,
          content: current.content,
          authorId: user.id,
        },
      });
      return tx.wikiPage.update({
        where: { id: current.id },
        data: {
          ...(body.title !== undefined ? { title: body.title } : {}),
          ...(body.content !== undefined ? { content: body.content } : {}),
          ...(body.published !== undefined ? { published: Boolean(body.published) } : {}),
        },
        select: {
          ...wikiListSelect,
          content: true,
        },
      });
    });

    await writeAudit({
      action: "wiki.update",
      entityType: "WikiPage",
      entityId: page.id,
      after: { detail: page.title },
      actorId: user.id,
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
