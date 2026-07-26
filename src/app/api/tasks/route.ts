import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const status = req.nextUrl.searchParams.get("status");
    const siteId = req.nextUrl.searchParams.get("siteId");
    const assigneeId = req.nextUrl.searchParams.get("assigneeId");
    const mine = req.nextUrl.searchParams.get("mine");
    const tasks = await prisma.task.findMany({
      where: {
        AND: [
          status ? { status } : {},
          siteId ? { siteId } : {},
          assigneeId ? { assigneeId } : {},
          mine === "1" ? { assigneeId: user.id } : {},
        ],
      },
      include: { site: true, assignee: true, creator: true },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
    });
    return NextResponse.json(tasks);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const body = await req.json();
    const title = String(body.title || "").trim();
    if (!title) {
      return NextResponse.json({ error: "Título requerido" }, { status: 400 });
    }

    if (body.siteId) {
      const site = await prisma.site.findUnique({ where: { id: body.siteId } });
      if (!site) {
        return NextResponse.json({ error: "Espacio no encontrado" }, { status: 404 });
      }
    }

    const task = await prisma.task.create({
      data: {
        title,
        description: body.description || null,
        status: body.status || "todo",
        priority: body.priority || "medium",
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        siteId: body.siteId || null,
        assigneeId: body.assigneeId || null,
        creatorId: user.id,
      },
      include: { site: true, assignee: true, creator: true },
    });

    if (body.assigneeId) {
      await prisma.notification.create({
        data: {
          userId: body.assigneeId,
          title: "Nueva tarea asignada",
          body: task.title,
          href: task.siteId ? `/sites/${task.siteId}/tareas` : "/tareas",
        },
      });
    }

    if (task.siteId) {
      await prisma.activity.create({
        data: {
          tipo: "sistema",
          mensaje: `Tarea creada: ${task.title}`,
          siteId: task.siteId,
          userId: user.id,
        },
      });
    }

    return NextResponse.json(task, { status: 201 });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    assertCsrf(req);
    await requireStaff();
    const body = await req.json();
    if (!body.id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }
    const task = await prisma.task.update({
      where: { id: body.id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.assigneeId !== undefined ? { assigneeId: body.assigneeId || null } : {}),
        ...(body.dueDate !== undefined
          ? { dueDate: body.dueDate ? new Date(body.dueDate) : null }
          : {}),
      },
      include: { site: true, assignee: true, creator: true },
    });
    if (body.status === "done" && task.siteId) {
      await prisma.activity.create({
        data: {
          tipo: "sistema",
          mensaje: `Tarea completada: ${task.title}`,
          siteId: task.siteId,
        },
      });
    }
    return NextResponse.json(task);
  } catch (e) {
    return handleRouteError(e);
  }
}
