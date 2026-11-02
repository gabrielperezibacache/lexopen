import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { audioRevisionSchema } from "@/lib/audio/ingest";
import { transcribeCaseAudio } from "@/lib/audio/service";
export const runtime = "nodejs";
export const maxDuration = 120;
export async function POST(request: Request, context: { params: Promise<{ id: string; audioId: string }> }) {
  try { assertCsrf(request); const user = await requireStaff(), { id, audioId } = await context.params; return NextResponse.json(await transcribeCaseAudio(id, audioId, await parseKnowledgeBody(request, audioRevisionSchema, 1024), user), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return handleRouteError(error); }
}
