import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { analyzeCaseSources } from "@/lib/knowledge/cases";
import { analyzeCaseSourcesSchema } from "@/lib/knowledge/case-schemas";
export async function POST(req:NextRequest,context:{params:Promise<{id:string}>}) {
  try {assertCsrf(req);const user=await requireStaff();const {id}=await context.params;return NextResponse.json(await analyzeCaseSources(id,user,await parseKnowledgeBody(req,analyzeCaseSourcesSchema)),{headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}});}
  catch(error){return handleRouteError(error);}
}
