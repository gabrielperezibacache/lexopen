import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { publicUserSelect } from "@/lib/auth/public-user";
import { causaAccessWhere } from "@/lib/auth/causa-access";
import { activeDelegadorIds } from "@/lib/auth/delegacion";
import { createTask, updateTasks } from "@/lib/tasks/service";
import { taskAccessWhere } from "@/lib/auth/causa-access";
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
          taskAccessWhere(user),
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
  try { assertCsrf(req); const user = await requireStaff(); return NextResponse.json(await createTask(user, await req.json()), { status: 201 }); }
  catch (error) { return handleRouteError(error); }
}

export async function PATCH(req: NextRequest) {
  try {
    assertCsrf(req); const user = await requireStaff(); const body = await req.json();
    const ids = Array.isArray(body.ids) ? body.ids : [body.id];
    const tasks = await updateTasks(user, ids, body);
    return NextResponse.json(Array.isArray(body.ids) ? { updated: tasks.length } : tasks[0]);
  } catch (error) { return handleRouteError(error); }
}
