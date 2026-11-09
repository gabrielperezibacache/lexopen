import { NextResponse } from "next/server";
import { z } from "zod";
import { assertCsrf, handleRouteError, httpError, requireStaff } from "@/lib/api";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { configureOrganizationDrive, organizationDriveSchema, organizationDriveState } from "@/lib/integrations/drive-organization";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie", "X-Content-Type-Options": "nosniff" };
const browse = z.object({ parentId: z.string().max(200).optional(), query: z.string().max(120).optional(), pageToken: z.string().max(2048).optional() }).strict();
function failure(error: unknown) { const response = handleRouteError(error); for (const [key, value] of Object.entries(headers)) response.headers.set(key, value); return response; }
export async function GET(request: Request) {
  try {
    const user = await requireStaff(), params = new URL(request.url).searchParams;
    if ([...params.keys()].some(key => params.getAll(key).length !== 1)) throw httpError("Consulta inválida", 400);
    return NextResponse.json(await organizationDriveState(user, {}, params.size ? browse.parse(Object.fromEntries(params)) : undefined), { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    assertCsrf(request); const user = await requireStaff();
    const input = await parseKnowledgeBody(request, organizationDriveSchema, 4096);
    if (!(await rateLimitAsync(`google-organization:${user.id}`, 12, 60_000)).ok) throw httpError("Espera un minuto antes de preparar otra carpeta", 429);
    request.signal.throwIfAborted();
    const result = await configureOrganizationDrive(user, input, { signal: request.signal, authorizeContext: async () => { const current = await requireStaff(); if (current.id !== user.id) throw httpError("La sesión cambió", 403); } });
    return NextResponse.json(result, { status: result.state === "unknown" ? 202 : 200, headers });
  } catch (error) { return failure(error); }
}
