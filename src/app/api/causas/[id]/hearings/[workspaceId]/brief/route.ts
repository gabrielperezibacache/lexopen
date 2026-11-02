import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { hearingBriefSchema } from "@/lib/hearings/schemas";
import { exportHearingBrief } from "@/lib/hearings/service";

type Context = { params: Promise<{ id: string; workspaceId: string }> };
export async function POST(req: Request, { params }: Context) {
  try {
    assertCsrf(req);
    const user = await requireStaff(), { id, workspaceId } = await params;
    const input = await parseKnowledgeBody(req, hearingBriefSchema, 100_000);
    return NextResponse.json(await exportHearingBrief(id, workspaceId, input, user), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return handleRouteError(error); }
}
