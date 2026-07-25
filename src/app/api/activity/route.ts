import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, requireStaff } from "@/lib/api";

export async function GET() {
  try {
    await requireStaff();
    const actividades = await prisma.activity.findMany({
      include: { user: true, causa: true },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return NextResponse.json(actividades);
  } catch (e) {
    return handleRouteError(e);
  }
}
