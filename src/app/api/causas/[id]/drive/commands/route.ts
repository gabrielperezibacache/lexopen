import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { caseDriveCommandSchema, caseDriveState, runCaseDriveCommand } from "@/lib/integrations/case-drive";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireStaff(), { id } = await context.params, url = new URL(request.url);
    if ([...url.searchParams.keys()].some(key => key !== "documentoId" || url.searchParams.getAll(key).length !== 1)) return NextResponse.json({ error: "Consulta inválida" }, { status: 400, headers });
    const documentoId = url.searchParams.get("documentoId") || undefined;
    if (documentoId && documentoId.length > 160) return NextResponse.json({ error: "Documento inválido" }, { status: 400, headers });
    return NextResponse.json(await caseDriveState(id, user, {}, documentoId), { headers });
  } catch (error) { return handleRouteError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    assertCsrf(request); const user = await requireStaff(), { id } = await context.params;
    const input = await parseKnowledgeBody(request, caseDriveCommandSchema, 8192);
    const result = await runCaseDriveCommand(id, user, input);
    return NextResponse.json(result, { status: ["completed", "failed"].includes(result.state) ? 200 : 202, headers });
  } catch (error) { return handleRouteError(error); }
}
