import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { z } from "zod";
import { prepareHearingSource } from "@/lib/hearings/pages";
type Context = { params: Promise<{ id: string; workspaceId: string; sourceId: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function POST(req: Request, { params }: Context) { try { assertCsrf(req); const user = await requireStaff(), { id, workspaceId, sourceId } = await params; await parseKnowledgeBody(req, z.object({}).strict(), 4096); return NextResponse.json(await prepareHearingSource(id, workspaceId, sourceId, user), { headers }); } catch (error) { return handleRouteError(error); } }
