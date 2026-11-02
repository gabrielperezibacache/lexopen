import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { hearingSourceSchema } from "@/lib/hearings/schemas";
import { attachHearingSource } from "@/lib/hearings/service";
type Context = { params: Promise<{ id: string; workspaceId: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function POST(req: Request, { params }: Context) { try { assertCsrf(req); const user = await requireStaff(), { id, workspaceId } = await params; return NextResponse.json(await attachHearingSource(id, workspaceId, await parseKnowledgeBody(req, hearingSourceSchema, 4096), user), { headers }); } catch (error) { return handleRouteError(error); } }
