import { NextResponse } from "next/server";
import { assertCsrf, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { liveAudioCommandSchema } from "@/lib/audio/live-schemas";
import { stopHearingLiveAudio } from "@/lib/audio/live-service";
import { liveHeaders, liveRouteError } from "../../../route-helper";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; workspaceId: string; sessionId: string }> };
export async function POST(request: Request, { params }: Context) { try { assertCsrf(request); const user = await requireStaff(), { id, workspaceId, sessionId } = await params; return NextResponse.json(await stopHearingLiveAudio(id, workspaceId, sessionId, await parseKnowledgeBody(request, liveAudioCommandSchema, 1024), user), { headers: liveHeaders }); } catch (error) { return liveRouteError(error); } }
