import { NextResponse } from "next/server";
import { assertCsrf, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { restoreCaseWriting } from "@/lib/writings/service";
import { writingRestoreSchema } from "@/lib/writings/schemas";
import { writingHeaders, writingRouteError } from "../../route-error";
type Context = { params: Promise<{ id: string; draftId: string }> };
export async function POST(req: Request, { params }: Context) {
  try { assertCsrf(req); const user = await requireStaff(), { id, draftId } = await params; return NextResponse.json(await restoreCaseWriting(id, draftId, await parseKnowledgeBody(req, writingRestoreSchema, 4096), user), { headers: writingHeaders }); } catch (error) { return writingRouteError(error); }
}
