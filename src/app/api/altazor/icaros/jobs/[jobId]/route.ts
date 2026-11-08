import { readIcaroJob } from "@/lib/altazor/icaros/service";
import { icaroActor, icaroFailure, icaroJson } from "@/lib/altazor/icaros/http";
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ jobId: string }> }) {
  try { return icaroJson(await readIcaroJob((await context.params).jobId, await icaroActor())); } catch (error) { return icaroFailure(error); }
}
