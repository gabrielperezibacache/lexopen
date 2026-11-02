import { NextResponse } from "next/server";
import { assertCsrf, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { hearingPromotionSchema } from "@/lib/hearings/promotions-schemas";
import { previewHearingPromotion, promoteHearingRecord } from "@/lib/hearings/promotions-service";
import { liveHeaders, liveRouteError, type LiveContext } from "../route-helper";

export async function GET(request: Request, { params }: LiveContext) {
  try { const actor = await requireStaff(), { id, workspaceId } = await params; return NextResponse.json(await previewHearingPromotion(id, workspaceId, Object.fromEntries(new URL(request.url).searchParams), actor), { headers: liveHeaders }); }
  catch (error) { return liveRouteError(error); }
}
export async function POST(request: Request, { params }: LiveContext) {
  try { assertCsrf(request); const actor = await requireStaff(), { id, workspaceId } = await params; return NextResponse.json(await promoteHearingRecord(id, workspaceId, await parseKnowledgeBody(request, hearingPromotionSchema), actor), { status: 201, headers: liveHeaders }); }
  catch (error) { return liveRouteError(error); }
}
