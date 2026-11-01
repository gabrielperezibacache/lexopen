import { NextRequest, NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { readCaseKnowledge } from "@/lib/knowledge/cases";
export async function GET(req: NextRequest, context: {params: Promise<{id: string}>}) {
  try { const user = await requireStaff(); const {id} = await context.params; const query = req.nextUrl.searchParams; return NextResponse.json(await readCaseKnowledge(id, user, {after: query.get("after") || undefined, q: query.get("q") || undefined, status: query.get("status") || undefined}), {headers: {"Cache-Control": "private, no-store", Vary: "Cookie"}}); }
  catch(error) { return handleRouteError(error); }
}
