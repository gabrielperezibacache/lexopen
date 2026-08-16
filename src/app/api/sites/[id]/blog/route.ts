import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireSiteAccess,
  requireUser,
} from "@/lib/api";
import { isCliente } from "@/lib/auth/rbac";
import { publicUserSelect } from "@/lib/auth/public-user";
import { writeAudit } from "@/lib/audit";

type Params = { params: Promise<{ id: string }> };

function slugify(title: string) {
  return String(title || "post")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    const posts = await prisma.blogPost.findMany({
      where: {
        siteId: id,
        ...(isCliente(user.role) ? { published: true } : {}),
      },
      include: { author: { select: publicUserSelect } },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return NextResponse.json(posts);
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
      return NextResponse.json({ error: "Clientes no pueden publicar" }, { status: 403 });
    }
    const body = await parseBody(
      req,
      z.object({
        title: z.string().trim().min(1).max(300),
        body: z.string().trim().min(1).max(100000),
        published: z.boolean().optional(),
      })
    );
    try {
      const post = await prisma.blogPost.create({
        data: {
          title: body.title,
          body: body.body,
          slug: slugify(body.title),
          published: body.published !== false,
          siteId: id,
          authorId: user.id,
        },
      });
      await prisma.activity.create({
        data: {
          tipo: "comentario",
          mensaje: `Blog: ${post.title}`,
          siteId: id,
          userId: user.id,
        },
      });
      await writeAudit({
        action: "blog.create",
        entityType: "BlogPost",
        entityId: post.id,
        after: { detail: post.title },
        actorId: user.id,
      });
      return NextResponse.json(post, { status: 201 });
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return NextResponse.json(
          { error: "Ya existe una publicación con ese título/slug en el espacio" },
          { status: 409 }
        );
      }
      throw err;
    }
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
      return NextResponse.json({ error: "Clientes no pueden editar el blog" }, { status: 403 });
    }
    const body = await parseBody(
      req,
      z.object({
        id: z.string().min(1),
        title: z.string().trim().min(1).max(300).optional(),
        body: z.string().trim().min(1).max(100000).optional(),
        published: z.boolean().optional(),
      })
    );
    const existing = await prisma.blogPost.findFirst({
      where: { id: body.id, siteId: id },
      select: { id: true, title: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Publicación no encontrada" }, { status: 404 });
    }
    try {
      const post = await prisma.blogPost.update({
        where: { id: existing.id },
        data: {
          ...(body.title !== undefined
            ? { title: body.title, slug: slugify(body.title) }
            : {}),
          ...(body.body !== undefined ? { body: body.body } : {}),
          ...(body.published !== undefined ? { published: body.published } : {}),
        },
      });
      await writeAudit({
        action: "blog.update",
        entityType: "BlogPost",
        entityId: post.id,
        after: { detail: post.title },
        actorId: user.id,
      });
      return NextResponse.json(post);
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002"
      ) {
        return NextResponse.json(
          { error: "Ya existe una publicación con ese título/slug en el espacio" },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (e) {
    return handleRouteError(e);
  }
}
