import { NextResponse } from "next/server";
import { z } from "zod";
import { handleRouteError, requireStaff } from "@/lib/api";
import { listPersonalDriveFolders } from "@/lib/integrations/drive-sync";
const query = z.object({ parentId: z.string().max(200).optional(), query: z.string().max(120).optional(), pageToken: z.string().max(2048).optional(), connectionId: z.string().min(1).max(160).optional(), bindingRevision: z.string().regex(/^[a-f0-9]{64}$/).optional(), caseRevision: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict();
export async function GET(request: Request, context: { params: Promise<{ causaId: string }> }) {
  try {
    const user = await requireStaff(); const url = new URL(request.url);
    if ([...url.searchParams.keys()].some(key => url.searchParams.getAll(key).length > 1)) return NextResponse.json({ error: "Consulta de carpeta inválida" }, { status: 400 });
    const input = query.parse(Object.fromEntries(url.searchParams));
    return NextResponse.json(await listPersonalDriveFolders((await context.params).causaId, user, input), { headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
  } catch (error) { return handleRouteError(error); }
}
