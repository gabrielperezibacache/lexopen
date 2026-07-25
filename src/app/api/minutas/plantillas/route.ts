import { NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    await requireStaff();
    const plantillas = await prisma.minutaPlantilla.findMany({
      orderBy: [{ tipo: "asc" }, { nombre: "asc" }],
    });
    return NextResponse.json(plantillas);
  } catch (e) {
    return handleRouteError(e);
  }
}
