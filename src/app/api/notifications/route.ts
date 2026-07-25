import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, requireUser } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const items = await prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: "desc" },
      take: 30,
    });
    return NextResponse.json(items);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const user = await requireUser();
    const body = await req.json();
    if (body.action === "read-all") {
      await prisma.notification.updateMany({
        where: { userId: user.id, read: false },
        data: { read: true },
      });
      return NextResponse.json({ ok: true });
    }
    if (body.id) {
      await prisma.notification.update({
        where: { id: body.id },
        data: { read: true },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
