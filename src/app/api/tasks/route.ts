import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  const status = req.nextUrl.searchParams.get("status");
  const mine = req.nextUrl.searchParams.get("mine");
  const user = await getCurrentUser();
  const tasks = await prisma.task.findMany({
    where: {
      AND: [
        status ? { status } : {},
        mine === "1" && user ? { assigneeId: user.id } : {},
      ],
    },
    include: { site: true, assignee: true, creator: true },
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });
  return NextResponse.json(tasks);
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const task = await prisma.task.update({
    where: { id: body.id },
    data: { status: body.status },
  });
  return NextResponse.json(task);
}
