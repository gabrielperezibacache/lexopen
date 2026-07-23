import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

type Params = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const tasks = await prisma.task.findMany({
    where: { siteId: id },
    include: { assignee: true, creator: true, comments: true },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });
  return NextResponse.json(tasks);
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const user = await getCurrentUser();
  const body = await req.json();
  const task = await prisma.task.create({
    data: {
      title: body.title,
      description: body.description || null,
      status: body.status || "todo",
      priority: body.priority || "medium",
      dueDate: body.dueDate ? new Date(body.dueDate) : null,
      siteId: id,
      assigneeId: body.assigneeId || null,
      creatorId: user?.id,
    },
  });
  if (body.assigneeId) {
    await prisma.notification.create({
      data: {
        userId: body.assigneeId,
        title: "Nueva tarea asignada",
        body: task.title,
        href: `/sites/${id}/tareas`,
      },
    });
  }
  await prisma.activity.create({
    data: {
      tipo: "sistema",
      mensaje: `Tarea creada: ${task.title}`,
      siteId: id,
      userId: user?.id,
    },
  });
  return NextResponse.json(task, { status: 201 });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = await req.json();
  const task = await prisma.task.update({
    where: { id: body.id },
    data: {
      status: body.status,
      title: body.title,
      priority: body.priority,
      assigneeId: body.assigneeId,
      dueDate: body.dueDate ? new Date(body.dueDate) : undefined,
    },
  });
  if (body.status === "done") {
    await prisma.activity.create({
      data: {
        tipo: "sistema",
        mensaje: `Tarea completada: ${task.title}`,
        siteId: id,
      },
    });
  }
  return NextResponse.json(task);
}
