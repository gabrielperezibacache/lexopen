import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { academicPrepareSchema } from "@/lib/altazor/academic-schemas";
import { prepareAcademicArtifact } from "@/lib/altazor/academic";
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string}>}){try{assertCsrf(req);const user=await requireStaff(),{id}=await params;return NextResponse.json(await prepareAcademicArtifact(id,await parseKnowledgeBody(req,academicPrepareSchema),user),{status:201});}catch(e){return handleRouteError(e);}}
