import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { publicUserSelect } from "@/lib/auth/public-user";
import { causaAccessWhere } from "@/lib/auth/causa-access";
import { can, canSome } from "@/lib/auth/permissions";
import { activeDelegadorIds } from "@/lib/auth/delegacion";
import { recordTaskHistorial } from "@/lib/tasks/sync-mirrors";
import type { Prisma } from "@prisma/client";

const OPEN_STATUSES = ["todo", "in_progress", "blocked", "waiting_client"];

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const status = req.nextUrl.searchParams.get("status");
    const siteId = req.nextUrl.searchParams.get("siteId");
    const assigneeId = req.nextUrl.searchParams.get("assigneeId");
    const causaId = req.nextUrl.searchParams.get("causaId");
    const origen = req.nextUrl.searchParams.get("origen");
    const mine = req.nextUrl.searchParams.get("mine");
    const delegated = req.nextUrl.searchParams.get("delegated");
    const open = req.nextUrl.searchParams.get("open");

    const causaFilter = causaAccessWhere(user);
    const delegatedFrom =
      delegated === "1" ? await activeDelegadorIds(user.id, "task.assign") : [];

    const assigneeFilter: Prisma.TaskWhereInput =
      mine === "1"
        ? { assigneeId: user.id }
        : delegated === "1"
          ? {
              OR: [
                { assigneeId: user.id },
                ...(delegatedFrom.length
                  ? [{ assigneeId: { in: delegatedFrom } }]
                  : []),
              ],
            }
          : assigneeId
            ? { assigneeId }
            : {};

    const tasks = await prisma.task.findMany({
      where: {
        AND: [
          status ? { status } : {},
          open === "1" ? { status: { in: OPEN_STATUSES } } : {},
          siteId ? { siteId } : {},
          causaId ? { causaId } : {},
          origen ? { origen } : {},
          assigneeFilter,
          {
            OR: [
              { causaId: null },
              { causa: causaFilter },
            ],
          },
        ],
      },
      include: {
        site: { select: { id: true, name: true } },
        causa: { select: { id: true, titulo: true, rit: true } },
        assignee: { select: publicUserSelect },
        creator: { select: publicUserSelect },
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: 500,
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

    if (body.causaId) {
      const { assertCausaAccess } = await import("@/lib/auth/causa-access");
      await assertCausaAccess(String(body.causaId), user);
    }

    if (body.assigneeId && body.assigneeId !== user.id) {
      if (!canSome(user, "task.assign")) {
        return NextResponse.json(
          { error: "No puede asignar tareas a otros" },
          { status: 403 }
        );
      }
    }

    const status = body.status || "todo";
    const task = await prisma.task.create({
      data: {
        title,
        description: body.description || null,
        status,
        priority: body.priority || "medium",
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        siteId: body.siteId || null,
        causaId: body.causaId || null,
        clienteId: body.clienteId || null,
        plazoId: body.plazoId || null,
        eventoId: body.eventoId || null,
        parentId: body.parentId || null,
        origen: body.origen || "manual",
        rrule: body.rrule || null,
        remindAt: body.remindAt ? new Date(body.remindAt) : null,
        waitingOn: body.waitingOn || null,
        assigneeId: body.assigneeId || null,
        creatorId: user.id,
        completedAt: status === "done" ? new Date() : null,
        completedById: status === "done" ? user.id : null,
      },
      include: {
        site: { select: { id: true, name: true } },
        causa: { select: { id: true, titulo: true, rit: true } },
        assignee: { select: publicUserSelect },
        creator: { select: publicUserSelect },
      },
    });

    await recordTaskHistorial({
      taskId: task.id,
      campo: "creada",
      despues: task.status,
      actorId: user.id,
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
    const user = await requireStaff();
    const body = await req.json();

    // PATCH masivo: { ids: string[], status?: string, assigneeId?: string }
    if (Array.isArray(body.ids) && body.ids.length) {
      const ids = body.ids.map(String).slice(0, 100);
      const data: Prisma.TaskUncheckedUpdateManyInput = {};
      if (body.status !== undefined) data.status = body.status;
      if (body.assigneeId !== undefined) data.assigneeId = body.assigneeId || null;
      if (body.remindAt !== undefined) {
        data.remindAt = body.remindAt ? new Date(body.remindAt) : null;
      }
      const result = await prisma.task.updateMany({
        where: { id: { in: ids } },
        data,
      });
      return NextResponse.json({ updated: result.count });
    }

    if (!body.id) {
      return NextResponse.json({ error: "id requerido" }, { status: 400 });
    }

    const before = await prisma.task.findUnique({ where: { id: body.id } });
    if (!before) {
      return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    }

    if (
      body.assigneeId !== undefined &&
      body.assigneeId !== before.assigneeId &&
      body.assigneeId !== user.id &&
      !can(user, "task.assign")
    ) {
      // scoped task.assign: permitir si hay delegación sobre el asignado actual
      const via = await activeDelegadorIds(user.id, "task.assign");
      if (!before.assigneeId || !via.includes(before.assigneeId)) {
        return NextResponse.json(
          { error: "No puede reasignar esta tarea" },
          { status: 403 }
        );
      }
    }

    const nextStatus = body.status !== undefined ? body.status : before.status;
    const task = await prisma.task.update({
      where: { id: body.id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.description !== undefined
          ? { description: body.description }
          : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.assigneeId !== undefined
          ? { assigneeId: body.assigneeId || null }
          : {}),
        ...(body.dueDate !== undefined
          ? { dueDate: body.dueDate ? new Date(body.dueDate) : null }
          : {}),
        ...(body.remindAt !== undefined
          ? { remindAt: body.remindAt ? new Date(body.remindAt) : null }
          : {}),
        ...(body.waitingOn !== undefined
          ? { waitingOn: body.waitingOn || null }
          : {}),
        ...(body.causaId !== undefined ? { causaId: body.causaId || null } : {}),
        ...(nextStatus === "done" && before.status !== "done"
          ? { completedAt: new Date(), completedById: user.id }
          : {}),
        ...(nextStatus !== "done" && before.status === "done"
          ? { completedAt: null, completedById: null }
          : {}),
      },
      include: {
        site: { select: { id: true, name: true } },
        causa: { select: { id: true, titulo: true, rit: true } },
        assignee: { select: publicUserSelect },
        creator: { select: publicUserSelect },
      },
    });

    if (body.status !== undefined && body.status !== before.status) {
      await recordTaskHistorial({
        taskId: task.id,
        campo: "estado",
        antes: before.status,
        despues: task.status,
        actorId: user.id,
      });
    }
    if (
      body.assigneeId !== undefined &&
      (body.assigneeId || null) !== before.assigneeId
    ) {
      await recordTaskHistorial({
        taskId: task.id,
        campo: "asignado",
        antes: before.assigneeId,
        despues: task.assigneeId,
        actorId: user.id,
      });
      if (task.assigneeId) {
        await prisma.notification.create({
          data: {
            userId: task.assigneeId,
            title: "Tarea reasignada",
            body: task.title,
            href: task.siteId ? `/sites/${task.siteId}/tareas` : "/tareas",
          },
        });
      }
    }
    if (body.remindAt !== undefined) {
      await recordTaskHistorial({
        taskId: task.id,
        campo: "posponer",
        despues: task.remindAt?.toISOString() ?? null,
        actorId: user.id,
      });
    }

    if (body.status === "done" && task.siteId) {
      await prisma.activity.create({
        data: {
          tipo: "sistema",
          mensaje: `Tarea completada: ${task.title}`,
          siteId: task.siteId,
        },
      });
    }

    // Recurrencia simple: al completar, crear la siguiente si hay rrule FREQ=
    if (
      body.status === "done" &&
      before.status !== "done" &&
      before.rrule &&
      /FREQ=(DAILY|WEEKLY|MONTHLY)/i.test(before.rrule)
    ) {
      const nextDue = nextDueFromRrule(before.dueDate, before.rrule);
      await prisma.task.create({
        data: {
          title: before.title,
          description: before.description,
          status: "todo",
          priority: before.priority,
          dueDate: nextDue,
          siteId: before.siteId,
          causaId: before.causaId,
          clienteId: before.clienteId,
          plazoId: before.plazoId,
          eventoId: before.eventoId,
          parentId: before.parentId,
          origen: before.origen,
          rrule: before.rrule,
          assigneeId: before.assigneeId,
          creatorId: user.id,
        },
      });
    }

    return NextResponse.json(task);
  } catch (e) {
    return handleRouteError(e);
  }
}

function nextDueFromRrule(from: Date | null, rrule: string): Date {
  const base = from ? new Date(from) : new Date();
  const interval = Number(/INTERVAL=(\d+)/i.exec(rrule)?.[1] || "1") || 1;
  const next = new Date(base);
  if (/FREQ=DAILY/i.test(rrule)) next.setDate(next.getDate() + interval);
  else if (/FREQ=WEEKLY/i.test(rrule)) next.setDate(next.getDate() + 7 * interval);
  else if (/FREQ=MONTHLY/i.test(rrule)) next.setMonth(next.getMonth() + interval);
  return next;
}
