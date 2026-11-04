import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { academicArtifactSaveSchema } from "@/lib/altazor/academic-schemas";
import { readAcademicArtifact, saveAcademicArtifact, executeAcademicArtifact, cancelAcademicArtifact } from "@/lib/altazor/academic";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
type Params={params:Promise<{id:string;artifactId:string}>};
export const maxDuration=120;
export async function GET(_req:NextRequest,{params}:Params){try{const {id,artifactId}=await params;return NextResponse.json(await readAcademicArtifact(id,artifactId,await requireStaff()),{headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}});}catch(e){return handleRouteError(e);}}
export async function PATCH(req:NextRequest,{params}:Params){try{assertCsrf(req);const user=await requireStaff(),{id,artifactId}=await params;return NextResponse.json(await saveAcademicArtifact(id,artifactId,await parseKnowledgeBody(req,academicArtifactSaveSchema),user));}catch(e){return handleRouteError(e);}}
export async function POST(req:NextRequest,{params}:Params){try{assertCsrf(req);const user=await requireStaff(),{id,artifactId}=await params,body=await parseKnowledgeBody(req,z.object({action:z.enum(["execute","cancel"])}).strict());if(body.action==="cancel")return NextResponse.json(await cancelAcademicArtifact(id,artifactId,user));if(!(await rateLimitAsync(`academic:${user.id}`,20,60000)).ok)return NextResponse.json({error:"Espere un momento antes de ejecutar otro análisis"},{status:429});return NextResponse.json(await executeAcademicArtifact(id,artifactId,user));}catch(e){return handleRouteError(e);}}
