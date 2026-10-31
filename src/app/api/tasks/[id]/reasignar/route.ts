import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireStaff,
} from "@/lib/api";
import { publicUserSelect } from "@/lib/auth/public-user";
import { can } from "@/lib/auth/permissions";
import { activeDelegadorIds } from "@/lib/auth/delegacion";
import { recordTaskHistorial } from "@/lib/tasks/sync-mirrors";
import { isStaff } from "@/lib/auth/rbac";

type Params = { params: Promise<{ id: string }> };

const schema = z.object({
  assigneeId: z.string().min(1).nullable(),
  nota: z.string().max(500).optional().nullable(),
});

export async function POST(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    const { id } = await params;
    const body = await parseBody(req, schema);

    const before = await prisma.task.findUnique({ where: { id } });
    if (!before) {
      return NextResponse.json({ error: "Tarea no encontrada" }, { status: 404 });
    }

    const allowed =
      can(user, "task.assign") ||
      (before.assigneeId &&
        (await activeDelegadorIds(user.id, "task.assign")).includes(
          before.assigneeId
        ));
    if (!allowed) {
      return NextResponse.json({ error: "No puede reasignar esta tarea" }, { status: 403 });
    }

    if (body.assigneeId) {
      const target = await prisma.user.findUnique({
        where: { id: body.assigneeId },
        select: { id: true, role: true },
      });
      if (!target || !isStaff(target.role)) {
        return NextResponse.json(
          { error: "El asignado debe ser staff" },
          { status: 400 }
        );
      }
    }

    const task = await prisma.task.update({
      where: { id },
      data: { assigneeId: body.assigneeId },
      include: {
        site: { select: { id: true, name: true } },
        causa: { select: { id: true, titulo: true } },
        assignee: { select: publicUserSelect },
      },
    });

    await recordTaskHistorial({
      taskId: task.id,
      campo: "asignado",
      antes: before.assigneeId,
      despues: task.assigneeId,
      nota: body.nota,
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

    return NextResponse.json(task);
  } catch (e) {
    return handleRouteError(e);
  }
}
