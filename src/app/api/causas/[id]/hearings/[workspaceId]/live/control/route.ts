import { NextResponse } from "next/server";
import { assertCsrf, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { hearingLiveControlSchema } from "@/lib/hearings/live-schemas";
import { controlHearingLive } from "@/lib/hearings/live-service";
import { liveHeaders, liveRouteError, type LiveContext } from "../route-helper";
export async function POST(request: Request, { params }: LiveContext) { try { assertCsrf(request); const actor = await requireStaff(), { id, workspaceId } = await params; return NextResponse.json(await controlHearingLive(id, workspaceId, await parseKnowledgeBody(request, hearingLiveControlSchema, 4096), actor), { headers: liveHeaders }); } catch (error) { return liveRouteError(error); } }
