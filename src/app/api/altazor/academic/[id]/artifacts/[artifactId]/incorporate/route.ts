import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { incorporateAcademicWriting } from "@/lib/altazor/academic";
const schema=z.object({causaId:z.string().min(1).max(100).regex(/^[A-Za-z0-9_-]+$/),expectedRevision:z.number().int().positive()}).strict();
export async function POST(req:NextRequest,{params}:{params:Promise<{id:string;artifactId:string}>}){
  try{assertCsrf(req);const user=await requireStaff(),{id,artifactId}=await params,input=await parseKnowledgeBody(req,schema);return NextResponse.json(await incorporateAcademicWriting(id,artifactId,input.causaId,input.expectedRevision,user),{status:201});}catch(error){return handleRouteError(error);}
}
