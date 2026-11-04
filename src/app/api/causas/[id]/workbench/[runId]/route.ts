import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { workbenchRunId } from "@/lib/workbench/schemas";
import { cancelWorkbenchRun, importWorkbenchWriting, readWorkbenchRun } from "@/lib/workbench/service";
import { executeWorkbenchRun } from "@/lib/workbench/worker";
import { workbenchError, workbenchHeaders } from "@/lib/workbench/http";
export const runtime = "nodejs";
export const maxDuration = 120;
type Context = { params: Promise<{ id: string; runId: string }> };
export async function GET(_req: Request, { params }: Context) {
  try { const { id, runId } = await params; return NextResponse.json(await readWorkbenchRun(id, workbenchRunId.parse(runId), await requireStaff()), { headers: workbenchHeaders }); } catch (error) { return workbenchError(error); }
}
export async function POST(req: Request, { params }: Context) {
  try {
    assertCsrf(req); const user = await requireStaff(), { id, runId: rawId } = await params, runId = workbenchRunId.parse(rawId);
    const { action } = await parseKnowledgeBody(req, z.object({ action: z.enum(["execute", "cancel", "import"]) }).strict());
    const result = action === "execute" ? await executeWorkbenchRun(id, runId, user) : action === "cancel" ? await cancelWorkbenchRun(id, runId, user) : await importWorkbenchWriting(id, runId, user);
    return NextResponse.json(result, { headers: workbenchHeaders });
  } catch (error) { return workbenchError(error); }
}
