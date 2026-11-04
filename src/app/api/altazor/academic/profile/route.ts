import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { academicProfileSaveSchema } from "@/lib/altazor/academic-schemas";
import { saveAcademicProfile } from "@/lib/altazor/academic";
export async function PUT(req:NextRequest) { try { assertCsrf(req); const user=await requireStaff(); return NextResponse.json(await saveAcademicProfile(await parseKnowledgeBody(req,academicProfileSaveSchema),user)); }catch(e){ return handleRouteError(e); } }
