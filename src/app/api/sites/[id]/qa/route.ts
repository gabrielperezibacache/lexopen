import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const threads = await prisma.qaThread.findMany({
    where: { siteId: id },
    include: {
      posts: { include: { author: true }, orderBy: { createdAt: "asc" } },
    },
    orderBy: { updatedAt: "desc" },
  });
  return NextResponse.json(threads);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
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
            authorId: user?.id,
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
        userId: user?.id,
      },
    });
    return NextResponse.json(thread, { status: 201 });
  }

  if (body.action === "reply" && body.threadId) {
    const post = await prisma.qaPost.create({
      data: {
        threadId: body.threadId,
        body: body.body,
        isAnswer: Boolean(body.isAnswer),
        authorId: user?.id,
      },
    });
    await prisma.qaThread.update({
      where: { id: body.threadId },
      data: {
        status: body.isAnswer ? "answered" : undefined,
        updatedAt: new Date(),
      },
    });
    return NextResponse.json(post, { status: 201 });
  }

  return NextResponse.json({ error: "Acción no válida" }, { status: 400 });
}
