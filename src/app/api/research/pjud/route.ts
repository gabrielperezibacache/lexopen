import { NextRequest } from "next/server";
import { assertCsrf, handleRouteError, httpError, requireStaff } from "@/lib/api";
import { canSome } from "@/lib/auth/permissions";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { pjudSearchSchema } from "@/lib/research/pjud-search";
import { searchPublicPjudJudgments } from "@/lib/research/sources";
import { privatePjudJson, privatePjudResponse } from "@/lib/pjud/private-response";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    if (!canSome(user, "assistant.use")) throw httpError("No tiene permiso para investigar fuentes", 403);
    const input = await parseKnowledgeBody(req, pjudSearchSchema, 4096);
    if (!(await rateLimitAsync(`research:pjud:${user.id}`, 12, 60_000)).ok) throw httpError("Espere un minuto antes de consultar nuevamente", 429);
    if (req.signal.aborted) throw httpError("La consulta fue cancelada", 408);
    // Parsing a streamed body and rate limiting can outlive a permission change.
    const current = await requireStaff();
    if (current.id !== user.id || !canSome(current, "assistant.use")) throw httpError("Su autorización para investigar fuentes cambió. Vuelva a consultar.", 403);
    return privatePjudJson(await searchPublicPjudJudgments(input, { signal: req.signal }));
  } catch (error) { return privatePjudResponse(handleRouteError(error)); }
}
