import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, httpError, requireStaff } from "@/lib/api";
import { readLegalSourceVersion } from "@/lib/research/service";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireStaff(); const { id } = await params;
    const after = Number(req.nextUrl.searchParams.get("after") || 0), q = req.nextUrl.searchParams.get("q") || undefined;
    if (!Number.isSafeInteger(after) || after < 0 || (q?.length || 0) > 200) throw httpError("Filtro de fuente inválido", 400);
    return NextResponse.json(await readLegalSourceVersion(id, user, { after, q }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleRouteError(error); }
}
