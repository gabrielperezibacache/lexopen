import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { altazorId, confirmAltazorTurnSchema } from "@/lib/altazor/schemas";
import { confirmAltazorTurn } from "@/lib/altazor/conversations";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; turnId: string }> }) { try { assertCsrf(request); const user = await requireStaff(); const { id, turnId } = await params; const body = await parseKnowledgeBody(request, confirmAltazorTurnSchema, 1024); return NextResponse.json(await confirmAltazorTurn(altazorId.parse(id), altazorId.parse(turnId), body.confirm, user), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
