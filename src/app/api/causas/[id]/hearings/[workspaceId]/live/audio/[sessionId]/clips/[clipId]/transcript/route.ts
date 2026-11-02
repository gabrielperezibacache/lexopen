import { requireStaff } from "@/lib/api";
import { readHearingLiveAudioTranscript } from "@/lib/audio/live-service";
import { liveHeaders, liveRouteError } from "../../../../../route-helper";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; workspaceId: string; sessionId: string; clipId: string }> };
export async function GET(_request: Request, { params }: Context) { try { const user = await requireStaff(), { id, workspaceId, sessionId, clipId } = await params, result = await readHearingLiveAudioTranscript(id, workspaceId, sessionId, clipId, user); return new Response(result.text, { headers: { ...liveHeaders, "Content-Type": "text/plain; charset=utf-8", "Content-Disposition": `attachment; filename="${result.filename}"` } }); } catch (error) { return liveRouteError(error); } }
