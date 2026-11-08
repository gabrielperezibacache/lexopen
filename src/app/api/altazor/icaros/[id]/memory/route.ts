import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { saveIcaroMemorySchema } from "@/lib/altazor/icaros/schemas";
import { listIcaroMemory, saveIcaroMemory } from "@/lib/altazor/icaros/service";
import { icaroActor, icaroFailure, icaroJson } from "@/lib/altazor/icaros/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try { return icaroJson(await listIcaroMemory((await context.params).id, await icaroActor())); } catch (error) { return icaroFailure(error); }
}
export async function POST(request: Request, context: Context) {
  try { const actor = await icaroActor(request), result = await saveIcaroMemory((await context.params).id, await parseKnowledgeBody(request, saveIcaroMemorySchema, 64_000), actor); return icaroJson(result, result.reused ? 200 : 201); } catch (error) { return icaroFailure(error); }
}
