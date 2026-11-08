import { NextResponse } from "next/server";
import { assertCsrf, parseBody, requireStaff } from "@/lib/api";
import { writingReviewSchema } from "@/lib/writings/schemas";
import { reviewCaseWriting } from "@/lib/writings/service";
import { writingHeaders, writingRouteError } from "../../route-error";
export async function POST(req: Request, { params }: { params: Promise<{ id: string; draftId: string }> }) {
  try {
    assertCsrf(req);
    const user = await requireStaff(), { id, draftId } = await params;
    return NextResponse.json(await reviewCaseWriting(id, draftId, await parseBody(req, writingReviewSchema), user), { headers: writingHeaders });
  } catch (error) { return writingRouteError(error); }
}
