import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { requestCommandKey, serializable } from "@/lib/command-execution";
import { currentStaffActor } from "@/lib/auth/staff-actor";
import { getMinuteView, updateNativeMinute } from "@/lib/minutas/http-service";
import { loadMinute } from "@/lib/minutas/mutations";
import { googleActionHttpStatus, pushMinutaToDrive } from "@/lib/integrations/google";
import { z } from "zod";
type Params = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function GET(_req: NextRequest, { params }: Params) {
  try { const user = await requireStaff(), { id } = await params; return NextResponse.json(await getMinuteView(user, id), { headers }); }
  catch (error) { return handleRouteError(error); }
}
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req); const user = await requireStaff(), { id } = await params;
    const body = await parseKnowledgeBody(req, z.record(z.string(), z.unknown()));
    if (body.action === "push-drive") {
      const actor = await serializable(async tx => { const actor = await currentStaffActor(user, tx); await loadMinute(id, actor, tx); return actor; });
      const result = await pushMinutaToDrive(id, { role: actor.role }); return NextResponse.json(result, { status: googleActionHttpStatus(result.status), headers });
    }
    const minute = await updateNativeMinute(user, id, body, requestCommandKey(req, "minuta.update"));
    return NextResponse.json(body.action === "accion-estado" ? minute.acciones.find(a => a.id === body.accionId) : minute, { headers });
  } catch (error) { return handleRouteError(error); }
}
