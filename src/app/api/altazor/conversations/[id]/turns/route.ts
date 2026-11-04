import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { altazorId, createTurnSchema } from "@/lib/altazor/schemas";
import { createAltazorTurn } from "@/lib/altazor/conversations";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertCsrf(request); const user = await requireStaff(); const limited = await rateLimitAsync(`altazor:turn:${user.id}`, 30, 60_000); if (!limited.ok) return NextResponse.json({ error: "Espere un momento antes de enviar otro mensaje" }, { status: 429 }); const { id } = await params; const result = await createAltazorTurn(altazorId.parse(id), await parseKnowledgeBody(request, createTurnSchema, 128 * 1024), user); return NextResponse.json(result, { status: result.reused ? 200 : 201, headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
