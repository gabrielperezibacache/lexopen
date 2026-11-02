import { NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { exportHearing } from "@/lib/hearings/service";
type Context = { params: Promise<{ id: string; workspaceId: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function GET(_req: Request, { params }: Context) { try { const user = await requireStaff(), { id, workspaceId } = await params; return NextResponse.json(await exportHearing(id, workspaceId, user), { headers }); } catch (error) { return handleRouteError(error); } }
