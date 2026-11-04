import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { altazorId } from "@/lib/altazor/schemas";
import { refreshAcademicSearch, refreshAcademicSearchSchema } from "@/lib/altazor/academic-discovery";
export const runtime = "nodejs";
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertCsrf(request); const user = await requireStaff(); if (!(await rateLimitAsync(`altazor:discovery-refresh:${user.id}`, 10, 60_000)).ok) return NextResponse.json({ error: "Espere antes de actualizar otra búsqueda" }, { status: 429 }); return NextResponse.json(await refreshAcademicSearch(altazorId.parse((await params).id), await parseKnowledgeBody(request, refreshAcademicSearchSchema, 4096), user, undefined, { signal: request.signal }), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
