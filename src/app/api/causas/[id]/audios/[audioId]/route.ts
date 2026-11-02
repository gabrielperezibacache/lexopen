import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { audioEditSchema } from "@/lib/audio/ingest";
import { editCaseAudio, readCaseAudio } from "@/lib/audio/service";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string; audioId: string }> };
export async function GET(_request: Request, context: Context) {
  try { const user = await requireStaff(), { id, audioId } = await context.params; return NextResponse.json(await readCaseAudio(id, audioId, user), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return handleRouteError(error); }
}
export async function PATCH(request: Request, context: Context) {
  try { assertCsrf(request); const user = await requireStaff(), { id, audioId } = await context.params; return NextResponse.json(await editCaseAudio(id, audioId, await parseKnowledgeBody(request, audioEditSchema), user), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return handleRouteError(error); }
}
