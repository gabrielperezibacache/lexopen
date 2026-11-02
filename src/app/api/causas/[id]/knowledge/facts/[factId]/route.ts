import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { readCaseFact, updateCaseFact } from "@/lib/knowledge/cases";
import { updateCaseFactSchema } from "@/lib/knowledge/case-schemas";
type Context = {params: Promise<{id:string;factId:string}>};
export async function GET(_req:NextRequest,context:Context) {
  try {const user=await requireStaff();const {id,factId}=await context.params;return NextResponse.json(await readCaseFact(id,factId,user),{headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}});}
  catch(error){return handleRouteError(error);}
}
export async function PATCH(req:NextRequest,context:Context) {
  try {assertCsrf(req);const user=await requireStaff();const {id,factId}=await context.params;return NextResponse.json(await updateCaseFact(id,factId,user,await parseKnowledgeBody(req,updateCaseFactSchema)),{headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}});}
  catch(error){return handleRouteError(error);}
}
