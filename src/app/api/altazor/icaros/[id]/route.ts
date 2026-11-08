import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { updateIcaroSchema } from "@/lib/altazor/icaros/schemas";
import { readIcaro, updateIcaro } from "@/lib/altazor/icaros/service";
import { icaroActor, icaroFailure, icaroJson } from "@/lib/altazor/icaros/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  try { return icaroJson(await readIcaro((await context.params).id, await icaroActor())); } catch (error) { return icaroFailure(error); }
}
export async function PATCH(request: Request, context: Context) {
  try { const actor = await icaroActor(request); return icaroJson(await updateIcaro((await context.params).id, await parseKnowledgeBody(request, updateIcaroSchema, 16_384), actor)); } catch (error) { return icaroFailure(error); }
}
