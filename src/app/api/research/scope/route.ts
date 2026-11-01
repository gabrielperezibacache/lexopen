import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, httpError, requireStaff } from "@/lib/api";
import { siteAccessWhere, siteFileReadWhere } from "@/lib/auth/causa-access";
import { canSome } from "@/lib/auth/permissions";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff();
    if (!canSome(user, "assistant.use")) throw httpError("No tiene permiso para investigar fuentes", 403);
    const siteId = req.nextUrl.searchParams.get("siteId");
    const q = req.nextUrl.searchParams.get("q")?.trim() || "";
    if ((siteId?.length || 0) > 100 || q.length > 100) throw httpError("Filtro de espacios inválido", 400);
    if (siteId) {
      const site = await prisma.site.findFirst({ where: { AND: [{ id: siteId }, siteAccessWhere(user)] }, select: { id: true, name: true } });
      if (!site) throw httpError("Espacio no encontrado o sin acceso", 404);
      const where = { AND: [siteFileReadWhere(user), { siteId }, ...(q ? [{ name: { contains: q, mode: "insensitive" as const } }] : [])] };
      const [files, count] = await Promise.all([prisma.siteFile.findMany({ where, orderBy: { id: "asc" }, take: 200, select: { id: true, name: true } }), prisma.siteFile.count({ where })]);
      return NextResponse.json({ site, files, limited: count > files.length }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const where = { AND: [siteAccessWhere(user), ...(q ? [{ name: { contains: q, mode: "insensitive" as const } }] : [])] };
    const sites = await prisma.site.findMany({ where, orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 101, select: { id: true, name: true } });
    return NextResponse.json({ sites: sites.slice(0, 100), limited: sites.length > 100 }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleRouteError(error); }
}
