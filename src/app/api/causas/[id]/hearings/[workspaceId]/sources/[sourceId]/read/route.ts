import { NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { readHearingSource } from "@/lib/hearings/sources";
import { hearingReadQuerySchema } from "@/lib/hearings/schemas";
type Context = { params: Promise<{ id: string; workspaceId: string; sourceId: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: Request, { params }: Context) { try { const user = await requireStaff(), { id, workspaceId, sourceId } = await params, query = hearingReadQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams)); return NextResponse.json(await readHearingSource(id, workspaceId, sourceId, user, query), { headers }); } catch (error) { return handleRouteError(error); } }
