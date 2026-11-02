import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { hearingPatchSchema } from "@/lib/hearings/schemas";
import { readHearing, updateHearing } from "@/lib/hearings/service";
type Context = { params: Promise<{ id: string; workspaceId: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function GET(_req: Request, { params }: Context) { try { const user = await requireStaff(), { id, workspaceId } = await params; return NextResponse.json(await readHearing(id, workspaceId, user), { headers }); } catch (error) { return handleRouteError(error); } }
export async function PATCH(req: Request, { params }: Context) { try { assertCsrf(req); const user = await requireStaff(), { id, workspaceId } = await params; return NextResponse.json(await updateHearing(id, workspaceId, await parseKnowledgeBody(req, hearingPatchSchema, 90_000), user), { headers }); } catch (error) { return handleRouteError(error); } }
