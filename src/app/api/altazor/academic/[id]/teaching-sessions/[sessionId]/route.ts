import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { deleteTeachingSession } from "@/lib/altazor/teaching-sessions";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string; sessionId: string }> };

export async function DELETE(request: Request, { params }: Params) {
  try {
    assertCsrf(request);
    const user = await requireStaff(), { id, sessionId } = await params;
    return Response.json(await deleteTeachingSession(id, sessionId, user), { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) { return handleRouteError(error); }
}
