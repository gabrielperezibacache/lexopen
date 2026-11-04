import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { altazorId } from "@/lib/altazor/schemas";
import { cancelAltazorTurn } from "@/lib/altazor/conversations";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string; turnId: string }> }) { try { assertCsrf(request); const user = await requireStaff(); const { id, turnId } = await params; return NextResponse.json(await cancelAltazorTurn(altazorId.parse(id), altazorId.parse(turnId), user), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
