import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { hearingNoteSchema } from "@/lib/hearings/schemas";
import { createHearingNote } from "@/lib/hearings/service";
type Context = { params: Promise<{ id: string; workspaceId: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function POST(req: Request, { params }: Context) { try { assertCsrf(req); const user = await requireStaff(), { id, workspaceId } = await params; return NextResponse.json(await createHearingNote(id, workspaceId, await parseKnowledgeBody(req, hearingNoteSchema, 100000), user), { headers }); } catch (error) { return handleRouteError(error); } }
