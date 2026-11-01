import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { readCaseConflict,updateCaseConflict } from "@/lib/knowledge/cases";
import { updateCaseConflictSchema } from "@/lib/knowledge/case-schemas";
type Context={params:Promise<{id:string;conflictId:string}>};
export async function GET(_req:NextRequest,context:Context) {
  try {const user=await requireStaff();const {id,conflictId}=await context.params;return NextResponse.json(await readCaseConflict(id,conflictId,user),{headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}});}
  catch(error){return handleRouteError(error);}
}
export async function PATCH(req:NextRequest,context:Context) {
  try {assertCsrf(req);const user=await requireStaff();const {id,conflictId}=await context.params;return NextResponse.json(await updateCaseConflict(id,conflictId,user,await parseKnowledgeBody(req,updateCaseConflictSchema)),{headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}});}
  catch(error){return handleRouteError(error);}
}
