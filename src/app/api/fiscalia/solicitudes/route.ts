import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { requestCommandKey } from "@/lib/command-execution";
import { fiscaliaFields, fiscaliaUpdate, FISCALIA_STATUSES } from "@/lib/fiscalia/contract";
import { fiscaliaWorkspace, saveFiscaliaRequest } from "@/lib/fiscalia/service";
const headers = { "Cache-Control": "private, no-store" };
export const dynamic = "force-dynamic";
export async function GET(req: NextRequest) {
  try {
    const user = await requireStaff(), status = req.nextUrl.searchParams.get("status") || "open";
    if (!["open", "all", ...Object.keys(FISCALIA_STATUSES)].includes(status)) return NextResponse.json({ error: "Estado de solicitud no válido" }, { status: 400, headers });
    return NextResponse.json(await fiscaliaWorkspace(user, { causaId: req.nextUrl.searchParams.get("causaId") || undefined, status }), { headers });
  } catch (e) { const response = handleRouteError(e); response.headers.set("Cache-Control", headers["Cache-Control"]); return response; }
}
async function save(req: NextRequest, update: boolean) {
  try {
    assertCsrf(req); const user = await requireStaff();
    const body = update ? await parseBody(req, fiscaliaUpdate) : await parseBody(req, fiscaliaFields);
    return NextResponse.json(await saveFiscaliaRequest(user, body, requestCommandKey(req, update ? "fiscalia.update" : "fiscalia.create"), update), { status: update ? 200 : 201, headers });
  } catch (e) { const response = handleRouteError(e); response.headers.set("Cache-Control", headers["Cache-Control"]); return response; }
}
export async function POST(req: NextRequest) { return save(req, false); }
export async function PATCH(req: NextRequest) { return save(req, true); }
