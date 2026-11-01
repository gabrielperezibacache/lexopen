import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { listCaseKnowledgeSources } from "@/lib/knowledge/cases";
export async function GET(req: NextRequest, context: {params: Promise<{id: string}>}) {
  try { const user = await requireStaff(); const {id} = await context.params; const query = req.nextUrl.searchParams; return NextResponse.json(await listCaseKnowledgeSources(id, user, {versionId: query.get("versionId") || undefined, after: query.has("after") ? Number(query.get("after")) : undefined, q: query.get("q") || undefined}), {headers: {"Cache-Control": "private, no-store", Vary: "Cookie"}}); }
  catch(error) { return handleRouteError(error); }
}
