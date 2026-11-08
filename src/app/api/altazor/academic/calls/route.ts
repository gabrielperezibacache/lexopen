import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { academicCallAction, listAcademicCalls, mutateAcademicCalls } from "@/lib/altazor/academic-calls";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";

export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };

export async function GET() {
  try {
    const user = await requireStaff();
    return Response.json(await listAcademicCalls(user), { headers });
  } catch (error) { return handleRouteError(error); }
}

export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const user = await requireStaff();
    const input = await parseKnowledgeBody(request, academicCallAction, 4096);
    if (input.action === "refresh" && !(await rateLimitAsync(`altazor:calls-refresh:${user.id}`, 8, 60_000)).ok) {
      return Response.json({ error: "Espera antes de volver a actualizar las convocatorias." }, { status: 429, headers });
    }
    const result = await mutateAcademicCalls(input, user, undefined, { signal: request.signal });
    return Response.json(result, { headers });
  } catch (error) { return handleRouteError(error); }
}
