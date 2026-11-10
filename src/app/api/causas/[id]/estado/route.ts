import { NextResponse } from "next/server";
import { requireStaff, handleRouteError } from "@/lib/api";
import { readCaseStatus } from "@/lib/causas/status-service";

export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireStaff();
    return NextResponse.json(await readCaseStatus((await params).id, user), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return handleRouteError(e); }
}
