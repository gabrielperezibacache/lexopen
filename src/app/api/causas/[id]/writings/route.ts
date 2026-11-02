import { NextResponse } from "next/server";
import { assertCsrf, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { createCaseWriting, listCaseWritings } from "@/lib/writings/service";
import { writingCreateSchema, writingId } from "@/lib/writings/schemas";
import { writingHeaders, writingRouteError } from "./route-error";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Context) {
  try { const user = await requireStaff(), { id } = await params, after = new URL(req.url).searchParams.get("after"); return NextResponse.json(await listCaseWritings(id, user, after ? writingId.parse(after) : undefined), { headers: writingHeaders }); } catch (error) { return writingRouteError(error); }
}
export async function POST(req: Request, { params }: Context) {
  try { assertCsrf(req); const user = await requireStaff(), { id } = await params; return NextResponse.json(await createCaseWriting(id, await parseKnowledgeBody(req, writingCreateSchema), user), { status: 201, headers: writingHeaders }); } catch (error) { return writingRouteError(error); }
}
