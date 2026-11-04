import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { altazorId } from "@/lib/altazor/schemas";
import { patchAcademicSearch, patchAcademicSearchSchema } from "@/lib/altazor/academic-discovery";
export const runtime = "nodejs";
export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) { try { assertCsrf(request); const user = await requireStaff(); return NextResponse.json(await patchAcademicSearch(altazorId.parse((await params).id), await parseKnowledgeBody(request, patchAcademicSearchSchema, 4096), user), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return handleRouteError(error); } }
