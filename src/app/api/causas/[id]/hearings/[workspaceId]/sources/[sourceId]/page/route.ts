import { NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { readHearingPage } from "@/lib/hearings/pages";
import { hearingReadQuerySchema } from "@/lib/hearings/schemas";
type Context = { params: Promise<{ id: string; workspaceId: string; sourceId: string }> };
export async function GET(req: Request, { params }: Context) { try { const user = await requireStaff(), { id, workspaceId, sourceId } = await params, query = hearingReadQuerySchema.parse(Object.fromEntries(new URL(req.url).searchParams)), page = await readHearingPage(id, workspaceId, sourceId, user, query); return new NextResponse(page as BodyInit, { headers: { "Content-Type": "image/png", "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); } catch (error) { return handleRouteError(error); } }
