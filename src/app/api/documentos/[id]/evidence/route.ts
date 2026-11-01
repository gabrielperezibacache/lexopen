import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { captureDocumentEvidence, readDocumentEvidence } from "@/lib/evidence/service";

type Context = { params: Promise<{ id: string }> };
export async function GET(req: NextRequest, { params }: Context) {
  try {
    const user = await requireStaff(); const { id } = await params;
    const sp = req.nextUrl.searchParams;
    const after = Number(sp.get("after") || 0);
    if (!Number.isSafeInteger(after) || after < 0) return NextResponse.json({ error: "Posición inválida" }, { status: 400 });
    const q = sp.get("q")?.trim();
    const page = sp.has("page") ? Number(sp.get("page")) : undefined;
    if (page !== undefined && (!Number.isInteger(page) || page < 1 || page > 500)) return NextResponse.json({ error: "Página inválida" }, { status: 400 });
    if (q && q.length > 200) return NextResponse.json({ error: "La búsqueda admite hasta 200 caracteres" }, { status: 400 });
    return NextResponse.json(await readDocumentEvidence(id, user, { versionId: sp.get("version") || undefined, after, q, page }), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return handleRouteError(e); }
}
export async function POST(req: NextRequest, { params }: Context) {
  try {
    assertCsrf(req); const user = await requireStaff(); const { id } = await params;
    return NextResponse.json(await captureDocumentEvidence(id, user), { status: 201, headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return handleRouteError(e); }
}
