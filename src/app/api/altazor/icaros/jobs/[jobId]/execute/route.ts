import { executeIcaroJob } from "@/lib/altazor/icaros/service";
import { icaroActor, icaroFailure, icaroJson } from "@/lib/altazor/icaros/http";
export const runtime = "nodejs";
export async function POST(request: Request, context: { params: Promise<{ jobId: string }> }) {
  try { const actor = await icaroActor(request); return icaroJson(await executeIcaroJob((await context.params).jobId, actor, { signal: request.signal })); } catch (error) { return icaroFailure(error); }
}
