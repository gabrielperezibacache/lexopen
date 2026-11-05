import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { GoogleIntegrationError } from "@/lib/integrations/google";
import { driveImportDependenciesForActor } from "@/lib/integrations/drive-sync";
import { importSelectedDriveFile, listDriveImportCandidates } from "@/lib/integrations/drive-import";

const selection = z.object({ folderId: z.string().min(10).max(200), fileId: z.string().min(10).max(200), version: z.string().regex(/^\d{1,30}$/) }).strict();
function errorResponse(error: unknown) {
  if (error instanceof GoogleIntegrationError) return NextResponse.json({ error: error.message, code: error.code }, { status: ["disabled", "sync_off"].includes(error.code) ? 403 : ["needs_oauth", "needs_reconnect"].includes(error.code) ? 401 : error.code === "credentials_missing" ? 503 : 502 });
  return handleRouteError(error);
}

export async function GET(req: Request, context: { params: Promise<{ causaId: string }> }) {
  try {
    const user = await requireStaff();
    const { causaId } = await context.params;
    const data = await listDriveImportCandidates(causaId, user, new URL(req.url).searchParams.get("pageToken"), await driveImportDependenciesForActor(causaId, user));
    return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(req: Request, context: { params: Promise<{ causaId: string }> }) {
  try {
    assertCsrf(req);
    const user = await requireStaff();
    if (Number(req.headers.get("content-length") || 0) > 4096) return NextResponse.json({ error: "Selección demasiado grande" }, { status: 413 });
    const { causaId } = await context.params;
    const data = selection.parse(await req.json());
    const result = await importSelectedDriveFile({ ...data, causaId }, user, await driveImportDependenciesForActor(causaId, user));
    return NextResponse.json(result, { status: result.reused ? 200 : 201, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) { return errorResponse(error); }
}
