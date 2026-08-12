import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireSiteAccess, requireUser } from "@/lib/api";
import { publicUserSelect } from "@/lib/auth/public-user";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await requireSiteAccess(id, user);
    const threads = await prisma.qaThread.findMany({
      where: {
        siteId: id,
        ...(user.role === "cliente" ? { status: "open" } : {}),
      },
      include: {
        posts: {
          include: { author: { select: publicUserSelect } },
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    });
    return NextResponse.json(threads);
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
    const body = await req.json();

    if (body.action === "create-thread") {
      const thread = await prisma.qaThread.create({
        data: {
          subject: body.subject,
          category: body.category || null,
          siteId: id,
          posts: {
            create: {
              body: body.body,
              authorId: user.id,
            },
          },
        },
        include: { posts: true },
      });
      await prisma.activity.create({
        data: {
          tipo: "comentario",
          mensaje: `Q&A: ${thread.subject}`,
          siteId: id,
          userId: user.id,
        },
      });
      return NextResponse.json(thread, { status: 201 });
    }

    if (body.action === "reply" && body.threadId) {
      const thread = await prisma.qaThread.findFirst({
        where: { id: body.threadId, siteId: id },
        select: { id: true, status: true },
      });
      if (!thread) return NextResponse.json({ error: "Hilo no encontrado" }, { status: 404 });
      if (user.role === "cliente" && thread.status !== "open") {
        return NextResponse.json(
          { error: "El hilo ya no acepta respuestas del portal" },
          { status: 403 }
        );
      }
      const post = await prisma.qaPost.create({
        data: {
          threadId: body.threadId,
          body: body.body,
          isAnswer: user.role !== "cliente" && Boolean(body.isAnswer),
          authorId: user.id,
        },
      });
      await prisma.qaThread.update({
        where: { id: thread.id },
        data: {
          status: user.role !== "cliente" && body.isAnswer ? "answered" : undefined,
          updatedAt: new Date(),
        },
      });
      return NextResponse.json(post, { status: 201 });
    }

    return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
  } catch (e) {
    return handleRouteError(e);
  }
}
