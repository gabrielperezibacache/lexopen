import { NextResponse } from "next/server";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { fileId, fileKind } from "@/lib/offline/file-schemas";
import { readOfflineFile } from "@/lib/offline/file-sources";
import { syncOfflineFile } from "@/lib/offline/file-service";
import { parseOfflineFileBody } from "@/lib/offline/file-body";
import { enqueueDocumentProcessing } from "@/lib/document-processing-queue";
const headers = { "Cache-Control": "private, no-store" };
export async function GET(req: Request) {
  try { const user = await requireStaff(), q = new URL(req.url).searchParams; return NextResponse.json(await readOfflineFile(user, fileKind.parse(q.get("kind")), fileId.parse(q.get("id"))), { headers }); }
  catch (e) { return handleRouteError(e); }
}
export async function POST(req: Request) {
  try { assertCsrf(req); const user = await requireStaff(), result = await syncOfflineFile(user, await parseOfflineFileBody(req)); if (result.entity.needsProcessing) enqueueDocumentProcessing({ id: result.entity.id, name: result.entity.fields.name }); return NextResponse.json(result, { headers }); }
  catch (e) { if ((e as { code?: string }).code === "offline_reference_conflict") return NextResponse.json({ error: (e as Error).message, code: "offline_reference_conflict", unapplied: true }, { status: (e as { status?: number }).status || 409, headers }); return handleRouteError(e); }
}
