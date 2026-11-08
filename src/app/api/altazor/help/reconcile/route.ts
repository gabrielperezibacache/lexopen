import { assertCsrf, handleRouteError, requireStaff } from "@/lib/api";
import { httpError } from "@/lib/auth/access";
import { rateLimitAsync } from "@/lib/auth/rate-limit";
import { reconcileComputerHelp } from "@/lib/altazor/help/reconciler";
export const runtime = "nodejs";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie" };
export async function POST(request: Request) {
  try {
    assertCsrf(request);
    const actor = await requireStaff();
    const limit = await rateLimitAsync(`altazor-help-reconcile:${actor.id}`, 6, 60_000);
    if (!limit.ok) throw httpError("Espere un momento antes de actualizar la ayuda.", 429);
    return Response.json(await reconcileComputerHelp({ ownerId: actor.id, limit: 10 }), { headers });
  } catch (error) { const response = handleRouteError(error); for (const [key, value] of Object.entries(headers)) response.headers.set(key, value); return response; }
}
