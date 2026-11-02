import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { hearingSourcePatchSchema, hearingDeleteSchema } from "@/lib/hearings/schemas";
import { updateHearingSource, deleteHearingSource } from "@/lib/hearings/service";
type Context = { params: Promise<{ id: string; workspaceId: string; sourceId: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function PATCH(req: Request, { params }: Context) { try { assertCsrf(req); const user = await requireStaff(), { id, workspaceId, sourceId } = await params; return NextResponse.json(await updateHearingSource(id, workspaceId, sourceId, await parseKnowledgeBody(req, hearingSourcePatchSchema, 4096), user), { headers }); } catch (error) { return handleRouteError(error); } }
export async function DELETE(req: Request, { params }: Context) { try { assertCsrf(req); const user = await requireStaff(), { id, workspaceId, sourceId } = await params; return NextResponse.json(await deleteHearingSource(id, workspaceId, sourceId, await parseKnowledgeBody(req, hearingDeleteSchema, 4096), user), { headers }); } catch (error) { return handleRouteError(error); } }
