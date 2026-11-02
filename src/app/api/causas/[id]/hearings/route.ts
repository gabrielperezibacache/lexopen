import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { hearingCreateSchema } from "@/lib/hearings/schemas";
import { listHearings, createHearing } from "@/lib/hearings/service";
type Context = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function GET(_req: Request, { params }: Context) { try { const user = await requireStaff(), { id } = await params; return NextResponse.json(await listHearings(id, user), { headers }); } catch (error) { return handleRouteError(error); } }
export async function POST(req: Request, { params }: Context) { try { assertCsrf(req); const user = await requireStaff(), { id } = await params; return NextResponse.json(await createHearing(id, await parseKnowledgeBody(req, hearingCreateSchema, 4096), user), { status: 201, headers }); } catch (error) { return handleRouteError(error); } }
