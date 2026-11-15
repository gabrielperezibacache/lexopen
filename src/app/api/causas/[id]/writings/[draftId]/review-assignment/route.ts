import { NextResponse, NextRequest } from "next/server";
import { assertCsrf, parseBody, requireStaff } from "@/lib/api";
import { writingAssignSchema } from "@/lib/writings/schemas";
import { assignCaseWritingReview, listWritingReviewers } from "@/lib/writings/service";
import { writingHeaders, writingRouteError } from "../../route-error";
type Context = { params: Promise<{id:string;draftId:string}> };
export async function GET(req: NextRequest, {params}: Context) {
  try { const user=await requireStaff(),{id,draftId}=await params;return NextResponse.json(await listWritingReviewers(id,draftId,user,req.nextUrl.searchParams.get("query")||""),{headers:writingHeaders}); }
  catch(error){return writingRouteError(error);}
}
export async function POST(req: Request, {params}: Context) {
  try { assertCsrf(req);const user=await requireStaff(),{id,draftId}=await params;return NextResponse.json(await assignCaseWritingReview(id,draftId,await parseBody(req,writingAssignSchema),user),{headers:writingHeaders}); }
  catch(error){return writingRouteError(error);}
}
