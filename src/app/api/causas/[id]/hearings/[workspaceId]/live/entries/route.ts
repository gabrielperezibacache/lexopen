import { NextResponse } from "next/server";
import { assertCsrf, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { hearingLiveEntrySchema } from "@/lib/hearings/live-schemas";
import { createHearingLiveEntry } from "@/lib/hearings/live-service";
import { liveHeaders, liveRouteError, type LiveContext } from "../route-helper";
export async function POST(request: Request, { params }: LiveContext) { try { assertCsrf(request); const actor = await requireStaff(), { id, workspaceId } = await params; return NextResponse.json(await createHearingLiveEntry(id, workspaceId, await parseKnowledgeBody(request, hearingLiveEntrySchema, 100_000), actor), { status: 201, headers: liveHeaders }); } catch (error) { return liveRouteError(error); } }
