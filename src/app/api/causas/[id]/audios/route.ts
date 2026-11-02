import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { readAudioUpload } from "@/lib/audio/ingest";
import { listCaseAudio, uploadCaseAudio } from "@/lib/audio/service";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try { const user = await requireStaff(), { id } = await context.params; return NextResponse.json(await listCaseAudio(id, user), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return handleRouteError(error); }
}
export async function POST(request: Request, context: Context) {
  try { assertCsrf(request); const user = await requireStaff(), { id } = await context.params, result = await uploadCaseAudio(id, await readAudioUpload(request), user); return NextResponse.json(result, { status: result.reused ? 200 : 201, headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return handleRouteError(error); }
}
