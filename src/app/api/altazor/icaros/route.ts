import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { createIcaroSchema } from "@/lib/altazor/icaros/schemas";
import { createIcaro, listIcaros } from "@/lib/altazor/icaros/service";
import { icaroActor, icaroFailure, icaroJson } from "@/lib/altazor/icaros/http";
export const runtime = "nodejs";
export async function GET(request: Request) {
  try { return icaroJson(await listIcaros(await icaroActor(), { causaId: new URL(request.url).searchParams.get("causaId") || null })); } catch (error) { return icaroFailure(error); }
}
export async function POST(request: Request) {
  try { const actor = await icaroActor(request), result = await createIcaro(await parseKnowledgeBody(request, createIcaroSchema, 16_384), actor); return icaroJson(result, result.reused ? 200 : 201); } catch (error) { return icaroFailure(error); }
}
