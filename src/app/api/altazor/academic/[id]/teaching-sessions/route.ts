import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { createTeachingSession, listTeachingSessions, teachingSessionSchema } from "@/lib/altazor/teaching-sessions";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireStaff(), { id } = await params;
    return Response.json(await listTeachingSessions(id, user), { headers });
  } catch (error) { return handleRouteError(error); }
}

export async function POST(request: Request, { params }: Params) {
  try {
    assertCsrf(request);
    const user = await requireStaff(), { id } = await params;
    const input = await parseKnowledgeBody(request, teachingSessionSchema, 2048);
    const result = await createTeachingSession(id, input, user);
    return Response.json(result, { status: result.reused ? 200 : 201, headers });
  } catch (error) { return handleRouteError(error); }
}
