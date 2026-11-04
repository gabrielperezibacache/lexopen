import { NextResponse } from "next/server";
import { requireStaff } from "@/lib/api";
import { workbenchRunId } from "@/lib/workbench/schemas";
import { workbenchSourceCatalog } from "@/lib/workbench/sources";
import { workbenchError, workbenchHeaders } from "@/lib/workbench/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(req: Request, { params }: Context) {
  try { const { id } = await params, after = new URL(req.url).searchParams.get("after"); return NextResponse.json(await workbenchSourceCatalog(id, await requireStaff(), after ? workbenchRunId.parse(after) : undefined), { headers: workbenchHeaders }); } catch (error) { return workbenchError(error); }
}
