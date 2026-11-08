import { assertCsrf, requireStaff } from "@/lib/api";
import { calendarFeedStatus, enableCalendarFeed, revokeCalendarFeed } from "@/lib/altazor/calendar-feed";
import { canEnableCalendarFeed } from "@/lib/altazor/calendar-feed-policy";
import { rateLimitAsync } from "@/lib/auth/rate-limit";

export const runtime = "nodejs";
type Params = { params: Promise<{ id: string }> };
const headers = {
  "Cache-Control": "private, no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  Vary: "Cookie",
};

function failure(reason: unknown) {
  // Management failures do not expose database errors or generated credentials.
  const status = Number((reason as { status?: number })?.status);
  if (status === 401) return Response.json({ error: "Inicia sesión para gestionar el enlace." }, { status, headers });
  if (status === 403) return Response.json({ error: "No tienes permiso para gestionar el enlace." }, { status, headers });
  if (status === 404) return Response.json({ error: "El trabajo docente no está disponible." }, { status, headers });
  if (status === 409) return Response.json({ error: "El enlace cambió. Vuelve a abrir el trabajo e inténtalo de nuevo." }, { status, headers });
  return Response.json({ error: "No se pudo gestionar el enlace de calendario." }, { status: 503, headers });
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const user = await requireStaff(), { id } = await params;
    return Response.json(await calendarFeedStatus(id, user), { headers });
  } catch (error) { return failure(error); }
}

export async function POST(request: Request, { params }: Params) {
  try {
    assertCsrf(request);
    const user = await requireStaff(), { id } = await params;
    if (!canEnableCalendarFeed(request)) {
      return Response.json({ error: "Abre LexOpen mediante HTTPS para generar un enlace de calendario externo." }, { status: 400, headers });
    }
    const allowed = await rateLimitAsync(`teaching-calendar-feed:${user.id}`, 12, 60_000);
    if (!allowed.ok) return Response.json({ error: "Espera un momento antes de generar otro enlace." }, { status: 429, headers });
    return Response.json(await enableCalendarFeed(id, user), { headers });
  } catch (error) { return failure(error); }
}

export async function DELETE(request: Request, { params }: Params) {
  try {
    assertCsrf(request);
    const user = await requireStaff(), { id } = await params;
    return Response.json(await revokeCalendarFeed(id, user), { headers });
  } catch (error) { return failure(error); }
}
