import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  const actividades = await prisma.activity.findMany({
    include: { user: true, causa: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  });
  return NextResponse.json(actividades);
}
