import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, requireStaff } from "@/lib/api";
import { publicUserSelect } from "@/lib/auth/public-user";

export async function GET() {
  try {
    await requireStaff();
    const actividades = await prisma.activity.findMany({
      include: {
        user: { select: publicUserSelect },
        causa: {
          select: {
            id: true,
            titulo: true,
            rit: true,
            estado: true,
            tribunal: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 40,
    });
    return NextResponse.json(actividades);
  } catch (e) {
    return handleRouteError(e);
  }
}
