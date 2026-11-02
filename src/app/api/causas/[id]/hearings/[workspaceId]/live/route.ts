import { NextResponse } from "next/server";
import { assertCsrf, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { hearingLivePlanSchema } from "@/lib/hearings/live-schemas";
import { readHearingLive, saveHearingLivePlan } from "@/lib/hearings/live-service";
import { liveHeaders, liveRouteError, type LiveContext } from "./route-helper";
export async function GET(request: Request, { params }: LiveContext) { try { const actor = await requireStaff(), { id, workspaceId } = await params; return NextResponse.json(await readHearingLive(id, workspaceId, actor, { before: new URL(request.url).searchParams.get("before") || undefined }), { headers: liveHeaders }); } catch (error) { return liveRouteError(error); } }
export async function PATCH(request: Request, { params }: LiveContext) { try { assertCsrf(request); const actor = await requireStaff(), { id, workspaceId } = await params; return NextResponse.json(await saveHearingLivePlan(id, workspaceId, await parseKnowledgeBody(request, hearingLivePlanSchema, 100_000), actor), { headers: liveHeaders }); } catch (error) { return liveRouteError(error); } }
