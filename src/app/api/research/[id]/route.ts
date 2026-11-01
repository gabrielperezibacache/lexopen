import { NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { readResearchRun } from "@/lib/research/service";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try { const user = await requireStaff(); const { id } = await params; return NextResponse.json(await readResearchRun(id, user), { headers: { "Cache-Control": "private, no-store" } }); }
  catch (error) { return handleRouteError(error); }
}
