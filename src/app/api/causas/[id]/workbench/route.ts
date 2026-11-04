import { NextResponse } from "next/server";
import { assertCsrf, requireStaff } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { createWorkbenchSchema } from "@/lib/workbench/schemas";
import { createWorkbenchRun, listWorkbenchRuns } from "@/lib/workbench/service";
import { workbenchError, workbenchHeaders } from "@/lib/workbench/http";
export const runtime = "nodejs";
type Context = { params: Promise<{ id: string }> };
export async function GET(_req: Request, { params }: Context) {
  try { const user = await requireStaff(), { id } = await params; return NextResponse.json(await listWorkbenchRuns(id, user), { headers: workbenchHeaders }); } catch (error) { return workbenchError(error); }
}
export async function POST(req: Request, { params }: Context) {
  try { assertCsrf(req); const user = await requireStaff(), { id } = await params; return NextResponse.json(await createWorkbenchRun(id, await parseKnowledgeBody(req, createWorkbenchSchema), user), { status: 201, headers: workbenchHeaders }); } catch (error) { return workbenchError(error); }
}
