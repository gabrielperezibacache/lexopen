import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { createCaseFact } from "@/lib/knowledge/cases";
import { createCaseFactSchema } from "@/lib/knowledge/case-schemas";
export async function POST(req: NextRequest, context: {params: Promise<{id: string}>}) {
  try { assertCsrf(req); const user = await requireStaff(); const {id} = await context.params; const result = await createCaseFact(id,user,await parseKnowledgeBody(req,createCaseFactSchema)); return NextResponse.json(result,{status: result.reused?200:201,headers:{"Cache-Control":"private, no-store",Vary:"Cookie"}}); }
  catch(error) { return handleRouteError(error); }
}
