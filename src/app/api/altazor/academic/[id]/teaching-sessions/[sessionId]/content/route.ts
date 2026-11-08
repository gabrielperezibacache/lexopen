import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { teachingSessionContentMutationSchema } from "@/lib/altazor/teaching-session-content";
import { updateTeachingSessionContent } from "@/lib/altazor/teaching-sessions";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string; sessionId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    assertCsrf(request);
    const user = await requireStaff();
    const { id, sessionId } = await params;
    const input = await parseKnowledgeBody(request, teachingSessionContentMutationSchema, 192 * 1024);
    return Response.json(await updateTeachingSessionContent(id, sessionId, input, user), {
      headers: { "Cache-Control": "private, no-store", Vary: "Cookie" },
    });
  } catch (error) { return handleRouteError(error); }
}
