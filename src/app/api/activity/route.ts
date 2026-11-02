import { handleRouteError, requireStaff } from "@/lib/api";
import { relatedCausaWhere as scopedrelatedCausaWhere } from "@/lib/auth/causa-access";
import { publicUserSelect } from "@/lib/auth/public-user";
import { prisma } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const user = await requireStaff();
    const actividades = await prisma.activity.findMany({ where: scopedrelatedCausaWhere(user),
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
