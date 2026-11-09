import { NextRequest, NextResponse } from "next/server";
import { assertCsrf, handleRouteError, httpError, requireStaff } from "@/lib/api";
import { canSome } from "@/lib/auth/permissions";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { pjudSearchSchema } from "@/lib/research/pjud-search";
import { searchPublicPjudJudgments } from "@/lib/research/sources";
export const runtime = "nodejs";
export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    if (!canSome(user, "assistant.use")) throw httpError("No tiene permiso para investigar fuentes", 403);
    const input = await parseKnowledgeBody(req, pjudSearchSchema, 4096);
    if (!(await rateLimitAsync(`research:pjud:${user.id}`, 12, 60_000)).ok) throw httpError("Espere un minuto antes de consultar nuevamente", 429);
    return NextResponse.json(await searchPublicPjudJudgments(input, { signal: req.signal }), { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) { const response = handleRouteError(error); response.headers.set("Cache-Control", "private, no-store"); return response; }
}
