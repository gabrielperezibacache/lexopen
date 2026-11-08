import { handleRouteError, requireStaff } from "@/lib/api";
import { exportTeachingSessions } from "@/lib/altazor/teaching-sessions";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireStaff();
    const { id } = await params;
    return new Response(await exportTeachingSessions(id, user), {
      headers: {
        "Content-Type": "text/calendar; charset=utf-8",
        "Content-Disposition": 'attachment; filename="lexopen-docencia.ics"',
        "Cache-Control": "private, no-store",
        Vary: "Cookie",
      },
    });
  } catch (error) { return handleRouteError(error); }
}
