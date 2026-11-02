import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { hearingNotePatchSchema, hearingDeleteSchema } from "@/lib/hearings/schemas";
import { updateHearingNote, deleteHearingNote } from "@/lib/hearings/service";
type Context = { params: Promise<{ id: string; workspaceId: string; noteId: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function PATCH(req: Request, { params }: Context) { try { assertCsrf(req); const user = await requireStaff(), { id, workspaceId, noteId } = await params; return NextResponse.json(await updateHearingNote(id, workspaceId, noteId, await parseKnowledgeBody(req, hearingNotePatchSchema, 100000), user), { headers }); } catch (error) { return handleRouteError(error); } }
export async function DELETE(req: Request, { params }: Context) { try { assertCsrf(req); const user = await requireStaff(), { id, workspaceId, noteId } = await params; return NextResponse.json(await deleteHearingNote(id, workspaceId, noteId, await parseKnowledgeBody(req, hearingDeleteSchema, 4096), user), { headers }); } catch (error) { return handleRouteError(error); } }
