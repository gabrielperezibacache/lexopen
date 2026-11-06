import { assertCsrf, handleRouteError, httpError, requireStaff } from "@/lib/api";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { createFeedback, createFeedbackSchema, readFeedback, updateFeedback, updateFeedbackSchema } from "@/lib/feedback/service";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

function failure(error: unknown) {
  const response = handleRouteError(error);
  for (const [name, value] of Object.entries(headers)) response.headers.set(name, value);
  return response;
}

async function limit(userId: string, action: "list" | "create" | "update") {
  const result = await rateLimitAsync(`feedback:${action}:${userId}`, action === "create" ? 12 : 60, action === "create" ? 3_600_000 : 60_000);
  if (!result.ok) throw httpError("Hay demasiadas solicitudes. Espera un momento y vuelve a intentarlo.", 429);
}

export async function GET(request: Request) {
  try {
    const user = await requireStaff();
    await limit(user.id, "list");
    return Response.json(await readFeedback(user, new URL(request.url).searchParams.get("before")), { headers });
  } catch (error) {
    return failure(error);
  }
}

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const user = await requireStaff();
    await limit(user.id, "create");
    const input = await parseKnowledgeBody(request, createFeedbackSchema, 20 * 1024);
    return Response.json({ feedback: await createFeedback(input, user) }, { headers, status: 201 });
  } catch (error) {
    return failure(error);
  }
}

export async function PATCH(request: Request) {
  try {
    assertCsrf(request);
    const user = await requireStaff();
    await limit(user.id, "update");
    const input = await parseKnowledgeBody(request, updateFeedbackSchema, 512);
    return Response.json({ feedback: await updateFeedback(input, user) }, { headers });
  } catch (error) {
    return failure(error);
  }
}
