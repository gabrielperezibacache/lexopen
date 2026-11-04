import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { academicWorkspaceCreateSchema } from "@/lib/altazor/academic-schemas";
import { academicOverview, createAcademicWorkspace } from "@/lib/altazor/academic";
export async function GET() { try { return NextResponse.json(await academicOverview(await requireStaff()), { headers: { "Cache-Control":"private, no-store", Vary:"Cookie" } }); } catch (e) { return handleRouteError(e); } }
export async function POST(req: NextRequest) { try { assertCsrf(req); const user=await requireStaff(); return NextResponse.json(await createAcademicWorkspace(await parseKnowledgeBody(req,academicWorkspaceCreateSchema),user),{status:201}); } catch(e){ return handleRouteError(e); } }
