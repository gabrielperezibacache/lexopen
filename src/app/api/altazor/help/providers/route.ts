import { assertCsrf, handleRouteError, requireRole } from "@/lib/api";
import { parseKnowledgeBody } from "@/lib/knowledge/route-body";
import { saveWhatsAppMetaConfig, whatsAppConfigSchema, whatsAppMetaSnapshot } from "@/lib/altazor/help/config";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
function failure(error: unknown) { const response = handleRouteError(error); for (const [key, value] of Object.entries(headers)) response.headers.set(key, value); return response; }
export async function GET() { try { await requireRole("admin"); return Response.json(await whatsAppMetaSnapshot(), { headers }); } catch (error) { return failure(error); } }
export async function PUT(request: Request) { try { assertCsrf(request); const actor = await requireRole("admin"); const input = await parseKnowledgeBody(request, whatsAppConfigSchema, 16 * 1024); return Response.json(await saveWhatsAppMetaConfig(actor, input), { headers }); } catch (error) { return failure(error); } }
