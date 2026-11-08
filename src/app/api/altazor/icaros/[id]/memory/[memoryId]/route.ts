import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { forgetIcaroMemorySchema } from "@/lib/altazor/icaros/schemas";
import { forgetIcaroMemory } from "@/lib/altazor/icaros/service";
import { icaroActor, icaroFailure, icaroJson } from "@/lib/altazor/icaros/http";
export const runtime = "nodejs";
export async function DELETE(request: Request, context: { params: Promise<{ id: string; memoryId: string }> }) {
  try { const actor = await icaroActor(request), { id, memoryId } = await context.params; return icaroJson(await forgetIcaroMemory(id, memoryId, await parseKnowledgeBody(request, forgetIcaroMemorySchema, 4096), actor)); } catch (error) { return icaroFailure(error); }
}
