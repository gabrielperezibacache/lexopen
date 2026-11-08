import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { deleteTeachingSession, editTeachingSession, teachingSessionDeleteScope, teachingSessionEditSchema } from "@/lib/altazor/teaching-sessions";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string; sessionId: string }> };
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function PATCH(request: Request, { params }: Params) {
  try {
    assertCsrf(request);
    const user = await requireStaff(), { id, sessionId } = await params;
    const input = await parseKnowledgeBody(request, teachingSessionEditSchema, 2048);
    return Response.json(await editTeachingSession(id, sessionId, input, user), { headers });
  } catch (error) { return handleRouteError(error); }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    assertCsrf(request);
    const user = await requireStaff(), { id, sessionId } = await params;
    const scope = teachingSessionDeleteScope.parse(new URL(request.url).searchParams.get("scope") ?? "single");
    return Response.json(await deleteTeachingSession(id, sessionId, user, undefined, scope), { headers });
  } catch (error) { return handleRouteError(error); }
}
