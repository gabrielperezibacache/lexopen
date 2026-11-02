import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createTask, updateTasks } from "@/lib/tasks/service";
import { taskAccessWhere } from "@/lib/auth/causa-access";
import { assertCsrf, handleRouteError, requireSiteAccess, requireStaff } from "@/lib/api";
import { publicUserSelect } from "@/lib/auth/public-user";
import { parseListLimit } from "@/lib/api/list-limit";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: Params) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    await requireSiteAccess(id, user);
    const limit = parseListLimit(req.nextUrl.searchParams.get("limit"), {
      default: 200,
      max: 500,
    });
    const tasks = await prisma.task.findMany({
      where: { siteId: id, ...taskAccessWhere(user) },
      include: {
        assignee: { select: publicUserSelect },
        creator: { select: publicUserSelect },
        comments: true,
      },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }],
      take: limit,
    });
    return NextResponse.json(tasks);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: NextRequest, { params }: Params) {
  try { assertCsrf(req); const user = await requireStaff(); const { id } = await params; await requireSiteAccess(id, user); return NextResponse.json(await createTask(user, { ...await req.json(), siteId: id }), { status: 201 }); }
  catch (error) { return handleRouteError(error); }
}
export async function PATCH(req: NextRequest, { params }: Params) {
  try { assertCsrf(req); const user = await requireStaff(); const { id } = await params; await requireSiteAccess(id, user); const body = await req.json(); const tasks = await updateTasks(user, [body.id], body, id); return NextResponse.json(tasks[0]); }
  catch (error) { return handleRouteError(error); }
}
