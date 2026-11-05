import { after, NextResponse } from "next/server";
import { z } from "zod";
import { parseKnowledgeBody as parseBoundedBody } from "@/lib/knowledge/route-body";
import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { getDriveSyncSettings, configureDriveSync, processDueDriveSyncSubscriptions, linkPersonalDriveFolder } from "@/lib/integrations/drive-sync";
const settings = z.union([z.object({ action: z.literal("link-personal-folder"), folderRef: z.string().min(10).max(2048), connectionId: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict(), z.object({ enabled: z.boolean(), intervalMinutes: z.number().int(), account: z.enum(["study", "personal"]) }).strict()]);
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ causaId: string }> }) {
  try { const user = await requireStaff(); return NextResponse.json(await getDriveSyncSettings((await context.params).causaId, user), { headers }); }
  catch (error) { return handleRouteError(error); }
}
export async function POST(request: Request, context: { params: Promise<{ causaId: string }> }) {
  try {
    assertCsrf(request); const user = await requireStaff(); const { causaId } = await context.params;
    if (Number(request.headers.get("content-length") || 0) > 4096) return NextResponse.json({ error: "Solicitud demasiado grande" }, { status: 413, headers });
    const input = await parseBoundedBody(request, settings, 4096);
    if ("action" in input) return NextResponse.json(await linkPersonalDriveFolder(causaId, user, input.folderRef, { connectionId: input.connectionId }), { headers });
    const state = await configureDriveSync(causaId, user, input);
    if (state.enabled) after(() => processDueDriveSyncSubscriptions({ causaId, limit: 1 }).then(() => undefined));
    return NextResponse.json(state, { headers });
  } catch (error) { return handleRouteError(error); }
}
