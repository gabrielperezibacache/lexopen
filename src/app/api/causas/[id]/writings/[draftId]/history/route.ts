import { NextResponse } from "next/server";
import { z } from "zod";
import { requireStaff } from "@/lib/api";
import { listCaseWritingHistory } from "@/lib/writings/service";
import { writingHeaders, writingRouteError } from "../../route-error";
type Context = { params: Promise<{ id: string; draftId: string }> };
export async function GET(req: Request, { params }: Context) {
  try { const user = await requireStaff(), { id, draftId } = await params, before = new URL(req.url).searchParams.get("before"); return NextResponse.json(await listCaseWritingHistory(id, draftId, user, before ? z.coerce.number().int().min(1).max(2_000_000_000).parse(before) : undefined), { headers: writingHeaders }); } catch (error) { return writingRouteError(error); }
}
