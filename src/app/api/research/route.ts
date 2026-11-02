import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { listResearchRuns, searchResearch } from "@/lib/research/service";

export async function GET() {
  try { const user = await requireStaff(); return NextResponse.json({ runs: await listResearchRuns(user) }, { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return handleRouteError(error); }
}
export async function POST(req: NextRequest) {
  try { assertCsrf(req); const user = await requireStaff(); return NextResponse.json(await searchResearch(user, await req.json()), { status: 201, headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return handleRouteError(error); }
}
