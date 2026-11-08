import { NextResponse } from "next/server";
import { assertCsrf, requireStaff, handleRouteError } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { syncOfflineEntity } from "@/lib/offline/service";
import { offlineSyncSchema } from "@/lib/offline/schemas";
export async function POST(req: Request) {
  try {
    assertCsrf(req); const user = await requireStaff();
    const input = await parseKnowledgeBody(req, offlineSyncSchema);
    return NextResponse.json(await syncOfflineEntity(user, input), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if ((error as { code?: string }).code === "offline_reference_conflict") return NextResponse.json({ error: (error as Error).message, code: "offline_reference_conflict", unapplied: true }, { status: (error as { status?: number }).status || 409, headers: { "Cache-Control": "private, no-store" } });
    return handleRouteError(error);
  }
}
