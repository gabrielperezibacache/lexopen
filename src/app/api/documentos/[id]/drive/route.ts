import { NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { documentReadWhere } from "@/lib/auth/causa-access";
import { prisma } from "@/lib/db";
import { caseDriveState } from "@/lib/integrations/case-drive";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireStaff(), { id } = await context.params;
    const document = await prisma.documento.findFirst({ where: { AND: [{ id }, documentReadWhere(user)] }, select: { causaId: true } });
    if (!document?.causaId) return NextResponse.json({ error: "Documento de causa no encontrado" }, { status: 404 });
    return NextResponse.json(await caseDriveState(document.causaId, user, {}, id), { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) { return handleRouteError(error); }
}
