import { NextResponse } from "next/server";
import { handleRouteError, httpError, requireStaff } from "@/lib/api";
import { readEvidencePageImage } from "@/lib/evidence/service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string; page: string }> }) {
  try {
    const user = await requireStaff();
    const { id, page } = await params;
    if (!/^[1-9]\d{0,2}$/.test(page)) throw httpError("Página inválida", 400);
    const bytes = await readEvidencePageImage(id, Number(page), user);
    return new NextResponse(new Uint8Array(bytes), { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Vary": "Cookie" } });
  } catch (error) { return handleRouteError(error); }
}
