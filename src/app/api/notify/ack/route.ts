import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  assertCsrf,
  handleRouteError,
  parseBody,
  requireUser,
} from "@/lib/api";
import { ackNotification, ackPlazo } from "@/lib/notify/plazos";

const schema = z.object({
  notificationId: z.string().min(1).optional(),
  plazoId: z.string().min(1).optional(),
  via: z.string().min(1).max(32).optional(),
});

export async function POST(req: NextRequest) {
  try {
    assertCsrf(req);
    const user = await requireUser();
    const body = await parseBody(req, schema);
    const via = body.via || "inapp";

    if (body.plazoId) {
      const result = await ackPlazo({
        plazoId: body.plazoId,
        userId: user.id,
        via,
        notificationId: body.notificationId,
      });
      return NextResponse.json(result);
    }
    if (body.notificationId) {
      const result = await ackNotification({
        notificationId: body.notificationId,
        userId: user.id,
        via,
      });
      if (!result.ok) {
        return NextResponse.json({ error: result.error }, { status: 404 });
      }
      return NextResponse.json(result);
    }
    return NextResponse.json(
      { error: "notificationId o plazoId requerido" },
      { status: 400 }
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
