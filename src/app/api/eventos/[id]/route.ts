import { assertCsrf, handleRouteError, parseBody, requireStaff } from "@/lib/api";
import { requestCommandKey } from "@/lib/command-execution";
import { deleteEventCommand, updateEventCommand } from "@/lib/calendario/commands";
import { eventoUpdateSchema } from "@/lib/calendario/event-input";
import { NextRequest, NextResponse } from "next/server";

type Params = { params: Promise<{ id: string }> };
const headers = { "Cache-Control": "private, no-store" };
export async function PATCH(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff(), { id } = await params;
    const body = await parseBody(req, eventoUpdateSchema);
    return NextResponse.json(await updateEventCommand(user, id, body, requestCommandKey(req, "evento.update")), { headers });
  } catch (error) { return handleRouteError(error); }
}
export async function DELETE(req: NextRequest, { params }: Params) {
  try {
    assertCsrf(req);
    const user = await requireStaff(), { id } = await params;
    await deleteEventCommand(user, id, requestCommandKey(req, "evento.delete"));
    return NextResponse.json({ ok: true }, { headers });
  } catch (error) { return handleRouteError(error); }
}
