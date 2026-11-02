import { NextResponse } from "next/server";
import { assertCsrf, requireStaff } from "@/lib/api";
import { readLiveAudioUpload } from "@/lib/audio/live-schemas";
import { appendHearingLiveAudioClip } from "@/lib/audio/live-service";
import { liveHeaders, liveRouteError } from "../../../route-helper";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; workspaceId: string; sessionId: string }> };
export async function POST(request: Request, { params }: Context) { try { assertCsrf(request); const user = await requireStaff(), { id, workspaceId, sessionId } = await params; return NextResponse.json(await appendHearingLiveAudioClip(id, workspaceId, sessionId, await readLiveAudioUpload(request), user), { headers: liveHeaders }); } catch (error) { return liveRouteError(error); } }
