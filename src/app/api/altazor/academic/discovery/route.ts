import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { academicDiscoveryQuery, searchAcademicDiscovery } from "@/lib/altazor/academic-discovery";
export const runtime = "nodejs";
export async function POST(request: Request) { try { assertCsrf(request); const user = await requireStaff(); if (!(await rateLimitAsync(`altazor:discovery:${user.id}`, 10, 60_000)).ok) return NextResponse.json({ error: "Espere antes de consultar nuevamente las fuentes" }, { status: 429 }); return NextResponse.json(await searchAcademicDiscovery(await parseKnowledgeBody(request, academicDiscoveryQuery, 8192), user, undefined, { signal: request.signal }), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
