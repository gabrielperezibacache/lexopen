import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { changeTeachingReminder, teachingReminderMutationSchema } from "@/lib/altazor/teaching-reminders";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string; sessionId: string }> };

export async function PATCH(request: Request, { params }: Params) {
  try {
    assertCsrf(request);
    const user = await requireStaff();
    const { id, sessionId } = await params;
    const input = await parseKnowledgeBody(request, teachingReminderMutationSchema, 2048);
    const result = await changeTeachingReminder(id, sessionId, input, user);
    return Response.json(result, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) { return handleRouteError(error); }
}
