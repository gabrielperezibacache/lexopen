import { cancelIcaroJob } from "@/lib/altazor/icaros/service";
import { icaroActor, icaroFailure, icaroJson } from "@/lib/altazor/icaros/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try { return icaroJson(await cancelIcaroJob((await context.params).jobId, await icaroActor(request))); } catch (error) { return icaroFailure(error); }
}
