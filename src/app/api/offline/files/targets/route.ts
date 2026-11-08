import { NextResponse } from "next/server";
import { handleRouteError, requireStaff } from "@/lib/api";
import { fileId, fileKind } from "@/lib/offline/file-schemas";
import { listFileTargets, targetSnapshot } from "@/lib/offline/file-sources";
import { serializable } from "@/lib/command-execution";
import { currentStaffActor } from "@/lib/auth/staff-actor";
export async function GET(req: Request) {
  try {
    const user = await requireStaff(), q = new URL(req.url).searchParams, kind = fileKind.parse(q.get("kind")), id = q.get("id");
    const items = id ? await serializable(async tx => [await targetSnapshot(kind === "documento" ? "cause" : "site", fileId.parse(id), q.get("folder") ? fileId.parse(q.get("folder")) : null, await currentStaffActor(user, tx), tx)]) : await listFileTargets(user, kind, (q.get("q") || "").slice(0, 200), q.get("site") ? fileId.parse(q.get("site")) : undefined);
    return NextResponse.json({ items }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return handleRouteError(e); }
}
