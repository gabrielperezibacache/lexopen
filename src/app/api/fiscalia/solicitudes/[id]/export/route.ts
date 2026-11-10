import { requireStaff, handleRouteError } from "@/lib/api";
import { exportFiscaliaRequest } from "@/lib/fiscalia/service";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireStaff(), { id } = await params;
    return new Response(await exportFiscaliaRequest(id, user), { headers: { "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": 'attachment; filename="solicitud-mi-fiscalia.txt"', "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (e) { const response = handleRouteError(e); response.headers.set("Cache-Control", "private, no-store"); return response; }
}
