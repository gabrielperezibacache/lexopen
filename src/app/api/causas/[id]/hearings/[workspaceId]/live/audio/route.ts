import { NextResponse } from "next/server";
import { assertCsrf, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { liveAudioStartSchema } from "@/lib/audio/live-schemas";
import { readHearingLiveAudio, startHearingLiveAudio } from "@/lib/audio/live-service";
import { liveHeaders, liveRouteError, type LiveContext } from "../route-helper";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: LiveContext) { try { const user = await requireStaff(), { id, workspaceId } = await params, q = new URL(request.url).searchParams; const query: Record<string, string> = {}; for (const [key, value] of q) { if (q.getAll(key).length !== 1) throw Object.assign(new Error("Consulta repetida"), { status: 400 }); query[key] = value; } return NextResponse.json(await readHearingLiveAudio(id, workspaceId, user, query), { headers: liveHeaders }); } catch (error) { return liveRouteError(error); } }
export async function POST(request: Request, { params }: LiveContext) { try { assertCsrf(request); const user = await requireStaff(), { id, workspaceId } = await params, result = await startHearingLiveAudio(id, workspaceId, await parseKnowledgeBody(request, liveAudioStartSchema, 2048), user); return NextResponse.json(result, { status: result.reused ? 200 : 201, headers: liveHeaders }); } catch (error) { return liveRouteError(error); } }
