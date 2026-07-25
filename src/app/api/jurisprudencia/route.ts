import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { handleRouteError, requireStaff } from "@/lib/api";

export async function GET(req: NextRequest) {
  try {
    await requireStaff();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q")?.trim().toLowerCase() || "";
    const materia = searchParams.get("materia");
    const tribunal = searchParams.get("tribunal");

    const all = await prisma.jurisprudencia.findMany({
      orderBy: { fecha: "desc" },
    });

    const filtered = all.filter((j) => {
      if (materia && j.materia !== materia) return false;
      if (tribunal && !j.tribunal.toLowerCase().includes(tribunal.toLowerCase()))
        return false;
      if (!q) return true;
      const hay = [
        j.rol,
        j.tribunal,
        j.caratula,
        j.descripcion,
        j.doctrina,
        j.texto,
        j.tags,
        j.materia,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });

    return NextResponse.json(filtered);
  } catch (e) {
    return handleRouteError(e);
  }
}
