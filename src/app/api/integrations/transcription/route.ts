import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireRole } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { readTranscriptionConfig, saveTranscriptionConfig, transcriptionConfigSchema } from "@/lib/audio/provider";
export const runtime = "nodejs";
export async function GET() {
  try { const user = await requireRole("admin"); return NextResponse.json(await readTranscriptionConfig(user), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return handleRouteError(error); }
}
export async function POST(request: Request) {
  try { assertCsrf(request); const user = await requireRole("admin"); return NextResponse.json(await saveTranscriptionConfig(await parseKnowledgeBody(request, transcriptionConfigSchema, 8192), user), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return handleRouteError(error); }
}
