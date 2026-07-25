import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, requireStaff } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    const status = req.nextUrl.searchParams.get("status");
    const mine = req.nextUrl.searchParams.get("mine");
    const tasks = await prisma.task.findMany({
      where: {
        AND: [
          status ? { status } : {},
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

export async function PATCH(req: NextRequest) {
  try {
    await requireStaff();
    const body = await req.json();
    const task = await prisma.task.update({
      where: { id: body.id },
      data: { status: body.status },
    });
    return NextResponse.json(task);
  } catch (e) {
    return handleRouteError(e);
  }
}
