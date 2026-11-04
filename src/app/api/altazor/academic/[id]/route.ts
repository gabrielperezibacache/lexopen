import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { academicWorkspaceSaveSchema } from "@/lib/altazor/academic-schemas";
import { readAcademicWorkspace, saveAcademicWorkspace } from "@/lib/altazor/academic";
type Params={params:Promise<{id:string}>};
export async function GET(_req:NextRequest,{params}:Params){try{const {id}=await params;return NextResponse.json(await readAcademicWorkspace(id,await requireStaff()),{headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}});}catch(e){return handleRouteError(e);}}
export async function PATCH(req:NextRequest,{params}:Params){try{assertCsrf(req);const user=await requireStaff(),{id}=await params;return NextResponse.json(await saveAcademicWorkspace(id,await parseKnowledgeBody(req,academicWorkspaceSaveSchema),user));}catch(e){return handleRouteError(e);}}
