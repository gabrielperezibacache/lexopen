import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { createIcaroJobSchema } from "@/lib/altazor/icaros/schemas";
import { createIcaroJob } from "@/lib/altazor/icaros/service";
import { icaroActor, icaroFailure, icaroJson } from "@/lib/altazor/icaros/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try { const actor = await icaroActor(request), result = await createIcaroJob((await context.params).id, await parseKnowledgeBody(request, createIcaroJobSchema, 128_000), actor); return icaroJson(result, result.reused ? 200 : 201); } catch (error) { return icaroFailure(error); }
}
